import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { folderIdFromUrl } from '@/lib/marcas/content/load'
import { GoogleApiError, googleGet, googleGetRaw } from '@/lib/marcas/google/client'

// Fork-only (Marcas · Contenido): downloads one image of a brand's
// Instagram folder, so whoever uploads a sticker story by hand gets the
// file from the board without opening Drive.
// GET /api/marcas/content/file?brand=<id>&file=<driveFileId>
//
// Same gate as the board: the brand is fetched with the CALLER's session
// (RLS), and the file must sit inside that brand's Drive folder — the
// robot reads more folders than any one brand's team should reach.
// Images only, and small: the function streams it once and stores nothing.

const DRIVE_ID = /^[\w-]{10,100}$/
const MAX_DEPTH = 6
const MAX_BYTES = 4 * 1024 * 1024

interface FileMeta {
  name: string
  mimeType: string
  size?: string
  parents?: string[]
}

const meta = (id: string) =>
  googleGet<FileMeta>(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType,size,parents&supportsAllDrives=true`)

/** Whether `rootId` is among the file's ancestors (Drive files have one parent). */
async function isInside(file: FileMeta, rootId: string): Promise<boolean> {
  let parent = file.parents?.[0]
  for (let depth = 0; parent && depth < MAX_DEPTH; depth++) {
    if (parent === rootId) return true
    parent = (await meta(parent)).parents?.[0]
  }
  return false
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brand') ?? ''
  const fileId = url.searchParams.get('file') ?? ''
  if (!brandId || !DRIVE_ID.test(fileId)) {
    return NextResponse.json({ error: 'brand and file are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: brand } = await supabase
    .from('marcas_brands')
    .select('id, drive_url')
    .eq('id', brandId)
    .limit(1)
    .maybeSingle()
  const rootId = folderIdFromUrl(brand?.drive_url ?? null)
  if (!brand || !rootId) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    const file = await meta(fileId)
    if (!file.mimeType.startsWith('image/') || !(await isInside(file, rootId))) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    if (Number(file.size ?? 0) > MAX_BYTES) {
      return NextResponse.json({ error: 'too_large' }, { status: 413 })
    }
    const res = await googleGetRaw(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`)
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 403 || err.status === 404)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    console.error('[marcas/content/file] download failed:', err)
    return NextResponse.json({ error: 'google_unavailable' }, { status: 502 })
  }
}
