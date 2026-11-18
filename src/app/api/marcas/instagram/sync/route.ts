import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { isCronSecret } from '@/lib/marcas/instagram/graph'
import { syncBrands } from '@/lib/marcas/instagram/sync'

// Fork-only (Marcas · Resumen): the scheduled Instagram read, so stories
// are kept before they vanish (24 h). Called twice a day by
// .github/workflows/marcas-instagram.yml.
// POST /api/marcas/instagram/sync   Authorization: Bearer <cronSecret>
//
// The secret is stored with the Meta token (marcas_integrations 'meta'),
// so no extra environment variable is needed on the host.

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const outcomes = await syncBrands(brands ?? [], true)
  const failed = Object.values(outcomes).filter((o) => o === 'error').length
  // Only counts: brand ids and outcomes stay out of the Actions log (the repo is public).
  return NextResponse.json(
    { brands: Object.keys(outcomes).length, ok: Object.values(outcomes).filter((o) => o === 'ok').length, failed },
    { status: failed > 0 ? 502 : 200 },
  )
}
