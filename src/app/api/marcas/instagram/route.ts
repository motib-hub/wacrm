import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { metaConfigured } from '@/lib/marcas/instagram/graph'
import { syncBrands, type SyncOutcome } from '@/lib/marcas/instagram/sync'
import type { PublishedItem } from '@/lib/marcas/instagram/tally'

// Fork-only (Marcas · Resumen): what each brand the caller can see
// published on Instagram between two Argentine dates.
// GET /api/marcas/instagram?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Brands come from the CALLER's session (RLS), so the refresh below only
// ever touches brands they can see. The refresh is throttled per brand;
// the rows themselves are read back with the caller's session too.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_WINDOW_DAYS = 62

export interface InstagramBrandState {
  username: string | null
  outcome: SyncOutcome
  firstSyncAt: string | null
  lastSyncAt: string | null
}

export interface InstagramResponse {
  configured: boolean
  brands: Record<string, InstagramBrandState>
  items: PublishedItem[]
}

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let configured = false
  let outcomes: Record<string, SyncOutcome> = {}
  try {
    configured = await metaConfigured()
    if (configured) outcomes = await syncBrands(brands ?? [])
  } catch (err) {
    console.error('[marcas/instagram] refresh failed:', err)
  }

  // Argentine days → UTC bounds (UTC−3 all year).
  const since = `${from}T03:00:00Z`
  const until = new Date(Date.parse(`${to}T03:00:00Z`) + 86_400_000).toISOString()
  const [media, syncs] = await Promise.all([
    supabase
      .from('marcas_ig_media')
      .select('id, brand_id, kind, media_type, taken_at, permalink')
      .gte('taken_at', since)
      .lt('taken_at', until)
      .order('taken_at')
      .limit(2000),
    supabase.from('marcas_ig_sync').select('brand_id, first_at, last_at'),
  ])
  if (media.error) return NextResponse.json({ error: media.error.message }, { status: 500 })

  const syncByBrand = new Map((syncs.data ?? []).map((s) => [s.brand_id as string, s]))
  const body: InstagramResponse = {
    configured,
    items: (media.data ?? []) as PublishedItem[],
    brands: Object.fromEntries(
      (brands ?? []).map((b) => {
        const s = syncByBrand.get(b.id)
        const outcome: SyncOutcome = outcomes[b.id] ?? (b.instagram_username ? 'error' : 'not_linked')
        return [b.id, { username: b.instagram_username, outcome, firstSyncAt: s?.first_at ?? null, lastSyncAt: s?.last_at ?? null }]
      }),
    ),
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
}
