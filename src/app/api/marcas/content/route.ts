import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadBrandContent } from '@/lib/marcas/content/load'
import type { ContentResponse } from '@/lib/marcas/content/types'
import { GoogleApiError } from '@/lib/marcas/google/client'

// Fork-only (Marcas, Etapa 2): the content board for one brand, read live
// from its planning sheet and Drive. GET /api/marcas/content?brand=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Access rides on RLS: the brand row is fetched with the CALLER's
// session, so a brand they can't see (not a member, or equipo on a
// hidden brand) simply isn't found. Only after that does the server use
// the Google service account.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_WINDOW_DAYS = 120

export async function GET(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brand') ?? ''
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!brandId || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    return NextResponse.json({ error: 'brand, from and to (YYYY-MM-DD) are required' }, { status: 400 })
  }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_WINDOW_DAYS) {
    return NextResponse.json({ error: `window longer than ${MAX_WINDOW_DAYS} days` }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: brand } = await supabase
    .from('marcas_brands')
    .select('id, sheet_url, drive_url')
    .eq('id', brandId)
    .limit(1)
    .maybeSingle()
  if (!brand) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!brand.sheet_url && !brand.drive_url) {
    return NextResponse.json({ error: 'no_sheet' }, { status: 409 })
  }

  try {
    const pieces = await loadBrandContent(
      brand.id,
      { sheetUrl: brand.sheet_url, folderUrl: brand.drive_url },
      { from, to },
    )
    const body: ContentResponse = {
      brandId: brand.id,
      sheetUrl: brand.sheet_url ?? brand.drive_url,
      generatedAt: new Date().toISOString(),
      pieces,
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    // The sheet itself is closed to the robot: say so, so the fix
    // (share it with the robot's address) is obvious from the screen.
    if (err instanceof GoogleApiError && (err.status === 403 || err.status === 404)) {
      return NextResponse.json({ error: 'no_access' }, { status: 409 })
    }
    console.error('[marcas/content] load failed:', err)
    return NextResponse.json({ error: 'google_unavailable' }, { status: 502 })
  }
}
