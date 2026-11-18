import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { metaConfigured } from '@/lib/marcas/instagram/graph'
import { dueForSync, syncBrands } from '@/lib/marcas/instagram/sync'
import type { PublishedItem } from '@/lib/marcas/instagram/tally'
import type { InstagramResponse } from '@/lib/marcas/instagram/types'

// Fork-only (Marcas · Resumen): what each brand the caller can see
// published on Instagram between two Argentine dates, as stored by the
// reads. GET /api/marcas/instagram?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Answers from the database right away. If a brand hasn't been read in
// the last few minutes, a read from Meta runs after the response
// (`refreshing: true` tells the page to ask again shortly), so a slow
// Meta never stalls the dashboard.
//
// Brands come from the CALLER's session (RLS): the background read only
// touches brands they can see, and rows are read back with their session.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_WINDOW_DAYS = 62
const MAX_ROWS = 5000

export async function GET(request: Request) {
  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
  }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_WINDOW_DAYS) {
    return NextResponse.json({ error: `window longer than ${MAX_WINDOW_DAYS} days` }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: brands, error } = await supabase.from('marcas_brands').select('id, instagram_username')
  if (error) return NextResponse.json({ error: 'brands unavailable' }, { status: 500 })

  let configured = false
  let refreshing = false
  try {
    configured = await metaConfigured()
    const due = configured ? await dueForSync(brands ?? []) : []
    if (due.length > 0) {
      refreshing = true
      after(() => syncBrands(due).catch((err) => console.error('[marcas/instagram] refresh failed:', err)))
    }
  } catch (err) {
    console.error('[marcas/instagram] refresh check failed:', err)
  }

  // Argentine days → UTC bounds (UTC−3 all year).
  const since = `${from}T03:00:00Z`
  const until = new Date(Date.parse(`${to}T03:00:00Z`) + 86_400_000).toISOString()
  const [media, log] = await Promise.all([
    supabase
      .from('marcas_ig_media')
      .select('id, brand_id, kind, media_type, taken_at, permalink')
      .gte('taken_at', since)
      .lt('taken_at', until)
      .order('taken_at')
      .limit(MAX_ROWS),
    // Reads since the window starts: they decide which days' stories can be judged.
    supabase.from('marcas_ig_sync_log').select('brand_id, at').gte('at', since).order('at').limit(MAX_ROWS),
  ])
  if (media.error || log.error) return NextResponse.json({ error: 'instagram rows unavailable' }, { status: 500 })

  const syncs = new Map<string, string[]>()
  for (const row of log.data ?? []) syncs.set(row.brand_id, [...(syncs.get(row.brand_id) ?? []), row.at])

  const body: InstagramResponse = {
    configured,
    refreshing,
    truncated: (media.data?.length ?? 0) >= MAX_ROWS || (log.data?.length ?? 0) >= MAX_ROWS,
    items: (media.data ?? []) as PublishedItem[],
    brands: Object.fromEntries(
      (brands ?? []).map((b) => [
        b.id,
        { username: b.instagram_username, syncs: syncs.get(b.id) ?? [], lastSyncAt: syncs.get(b.id)?.at(-1) ?? null },
      ]),
    ),
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
}
