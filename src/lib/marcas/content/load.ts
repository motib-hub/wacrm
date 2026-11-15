import { googleGet, GoogleApiError } from '@/lib/marcas/google/client';
import { monthFromTabTitle, parsePlanningTab, type SheetCell } from './sheet-parser';
import type { ContentPiece, PieceMedia, PieceStatus, PlannedRow } from './types';

/**
 * Reads a brand's planning sheet and the Drive material each row links
 * to, live. Only the month tabs that overlap the requested window are
 * read, and each linked folder is listed once.
 *
 * A short per-instance cache (CACHE_MS) absorbs the board's auto-refresh
 * and several people looking at the same brand, while keeping "Ailén
 * just uploaded it" visible within a minute or two.
 */

const CACHE_MS = 60_000;
const FOLDER_CONCURRENCY = 5;
const cache = new Map<string, { at: number; pieces: ContentPiece[] }>();

export function spreadsheetIdFromUrl(url: string | null): string | null {
  return url?.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? null;
}

/** Month keys ("2026-11") that a [from, to] date window touches. */
export function monthsInWindow(from: string, to: string): Set<string> {
  const out = new Set<string>();
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    out.add(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

interface SheetsResponse {
  sheets?: { properties: { title: string }; data?: { rowData?: { values?: SheetCell[] }[] }[] }[];
}

async function readPlannedRows(spreadsheetId: string, months: Set<string>): Promise<PlannedRow[]> {
  const meta = await googleGet<SheetsResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
  );
  const tabs = (meta.sheets ?? [])
    .map((s) => s.properties.title)
    .filter((title) => {
      const m = monthFromTabTitle(title);
      return m !== null && months.has(`${m.year}-${String(m.month).padStart(2, '0')}`);
    });
  if (tabs.length === 0) return [];

  const ranges = tabs.map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'!A1:Z200`)}`).join('&');
  const data = await googleGet<SheetsResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${ranges}` +
      '&fields=sheets(properties.title,data.rowData.values(formattedValue,hyperlink))',
  );
  return (data.sheets ?? []).flatMap((sheet) =>
    parsePlanningTab(
      sheet.properties.title,
      (sheet.data?.[0]?.rowData ?? []).map((r) => r.values ?? []),
    ),
  );
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

const FILE_FIELDS = 'id,name,mimeType,thumbnailLink,webViewLink';

function toMedia(file: DriveFile): PieceMedia {
  const kind = file.mimeType.startsWith('image/') ? 'image' : file.mimeType.startsWith('video/') ? 'video' : 'other';
  return {
    id: file.id,
    name: file.name,
    kind,
    // Drive hands back a 220px thumbnail; ask for a sharper one.
    thumbnail: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, '=s800') : null,
    viewUrl: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
  };
}

async function mediaFor(row: PlannedRow): Promise<PieceMedia[] | null> {
  const link = row.link;
  try {
    if (link?.kind === 'drive-folder') {
      const q = encodeURIComponent(`'${link.id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
      const res = await googleGet<{ files?: DriveFile[] }>(
        `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&pageSize=50&fields=files(${FILE_FIELDS})` +
          '&supportsAllDrives=true&includeItemsFromAllDrives=true',
      );
      return (res.files ?? []).map(toMedia);
    }
    if (link?.kind === 'drive-file') {
      const file = await googleGet<DriveFile>(
        `https://www.googleapis.com/drive/v3/files/${link.id}?fields=${FILE_FIELDS}&supportsAllDrives=true`,
      );
      return [toMedia(file)];
    }
  } catch (err) {
    // A folder the robot can't see is a sharing problem on one row, not a
    // reason to fail the whole board: the card says so instead.
    if (err instanceof GoogleApiError && (err.status === 403 || err.status === 404)) return null;
    throw err;
  }
  return [];
}

export function statusFor(row: PlannedRow, media: PieceMedia[] | null): PieceStatus {
  if (row.link?.kind === 'instagram') return 'publicada';
  if (row.scheduled) return 'programada';
  if (!row.link) return 'sin-pieza';
  if (media && media.length > 0) return 'lista';
  if (row.link.kind === 'other') return 'lista';
  return 'sin-material';
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

export async function loadBrandContent(
  brandId: string,
  sheetUrl: string,
  window: { from: string; to: string },
): Promise<ContentPiece[]> {
  const cacheKey = `${brandId}|${window.from}|${window.to}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.pieces;

  const spreadsheetId = spreadsheetIdFromUrl(sheetUrl);
  if (!spreadsheetId) return [];
  const rows = (await readPlannedRows(spreadsheetId, monthsInWindow(window.from, window.to))).filter(
    (r) => !r.date || (r.date >= window.from && r.date <= window.to),
  );
  const pieces = await mapLimited(rows, FOLDER_CONCURRENCY, async (row) => {
    const media = await mediaFor(row);
    return { ...row, media: media ?? [], status: statusFor(row, media) } satisfies ContentPiece;
  });
  pieces.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.time ?? '').localeCompare(b.time ?? ''));
  cache.set(cacheKey, { at: Date.now(), pieces });
  return pieces;
}
