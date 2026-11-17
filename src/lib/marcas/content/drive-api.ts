import { googleGet, googleGetRaw } from '@/lib/marcas/google/client';
import { isManualName } from './manual';
import type { PieceMedia } from './types';

/** Thin Drive v3 helpers for the content board (read-only robot). */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

const FIELDS = 'id,name,mimeType,thumbnailLink,webViewLink';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Direct children of a folder, by name. An unreadable folder lists as empty. */
export async function listFolder(id: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
  const res = await googleGet<{ files?: DriveFile[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&pageSize=200&fields=files(${FIELDS})` +
      '&supportsAllDrives=true&includeItemsFromAllDrives=true',
  );
  return res.files ?? [];
}

export async function getFile(id: string): Promise<DriveFile> {
  return googleGet<DriveFile>(`https://www.googleapis.com/drive/v3/files/${id}?fields=${FIELDS}&supportsAllDrives=true`);
}

/** A small text file's contents (the stories' "QUE SUBIR.txt"). */
export async function readTextFile(id: string): Promise<string> {
  const res = await googleGetRaw(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`);
  return (await res.text()).slice(0, 4000);
}

export function isMediaFile(file: DriveFile): boolean {
  return file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/');
}

export function toMedia(file: DriveFile): PieceMedia {
  const kind = file.mimeType.startsWith('image/') ? 'image' : file.mimeType.startsWith('video/') ? 'video' : 'other';
  return {
    id: file.id,
    name: file.name,
    kind,
    // Drive hands back a 220px thumbnail; ask for a sharper one.
    thumbnail: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, '=s800') : null,
    viewUrl: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
    manual: isManualName(file.name),
  };
}

export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
