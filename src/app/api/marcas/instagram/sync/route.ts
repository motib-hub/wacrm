import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { isCronSecret } from '@/lib/marcas/instagram/graph'
import { pruneSyncLog, syncBrands } from '@/lib/marcas/instagram/sync'

// Fork-only (Marcas · Resumen): the scheduled Instagram read, so stories
// are kept before they vanish (24 h). Called twice a day by
// .github/workflows/marcas-instagram.yml.
// POST /api/marcas/instagram/sync   Authorization: Bearer <cronSecret>
//
// The secret is stored with the Meta token (marcas_integrations 'meta'),
// so no extra environment variable is needed on the host. Responses carry
// only counts and generic errors: the Actions log is public.

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!(await isCronSecret(given))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: brands, error } = await supabaseAdmin()
    .from('marcas_brands')
    .select('id, instagram_username')
    .not('instagram_username', 'is', null)
  if (error) {
    console.error('[marcas/instagram/sync] brands:', error.message)
    return NextResponse.json({ error: 'brands unavailable' }, { status: 500 })
  }

  const outcomes = Object.values(await syncBrands(brands ?? []))
  await pruneSyncLog()
  const failed = outcomes.filter((o) => o !== 'ok').length
  return NextResponse.json(
    { brands: outcomes.length, ok: outcomes.length - failed, failed },
    { status: failed > 0 ? 502 : 200 },
  )
}
