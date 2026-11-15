import { googleGet, GoogleApiError } from '@/lib/marcas/google/client';
import { getFile, isMediaFile, listFolder, mapLimited, toMedia } from './drive-api';
import { scanInstagramFolder } from './drive-scan';
import { mergeSheetAndDrive, type Draft } from './merge';
import { monthFromTabTitle, parsePlanningTab, type SheetCell } from './sheet-parser';
import type { ContentPiece, PieceMedia, PieceStatus, PlannedRow } from './types';

/**
 * Builds a brand's content board, live, from two sources:
 *  - its planning sheet (what is planned: date, topic, copy, format), and
 *  - its Instagram folder in Drive (what exists: dated Feed and Stories
 *    folders), so material shows up even when nobody pasted its link.
 * Only month tabs and month folders that overlap the window are read.
 *
 * A short per-instance cache (CACHE_MS) absorbs the board's auto-refresh
 * and several people looking at the same brand, while keeping "Ailén
 * just uploaded it" visible within a minute or two.
 */

const CACHE_MS = 60_000;
const CONCURRENCY = 5;
const cache = new Map<string, { at: number; pieces: ContentPiece[] }>();

export function spreadsheetIdFromUrl(url: string | null): string | null {
  return url?.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? null;
}

export function folderIdFromUrl(url: string | null): string | null {
  return url?.match(/\/folders\/([\w-]+)/)?.[1] ?? null;
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

const unreadable = (err: unknown) => err instanceof GoogleApiError && (err.status === 403 || err.status === 404);

/** Material behind a row's link; null when the robot can't open it. */
async function mediaFor(row: PlannedRow): Promise<PieceMedia[] | null> {
  const link = row.link;
  try {
    if (link?.kind === 'drive-folder') return (await listFolder(link.id)).filter(isMediaFile).map(toMedia);
    if (link?.kind === 'drive-file') return [toMedia(await getFile(link.id))];
  } catch (err) {
    // A folder the robot can't see is a sharing problem on one row, not a
    // reason to fail the whole board: the card says so instead.
    if (unreadable(err)) return null;
    throw err;
  }
  return [];
}

export function statusFor(row: PlannedRow, media: PieceMedia[] | null): PieceStatus {
  if (row.link?.kind === 'instagram') return 'publicada';
  if (row.scheduled) return 'programada';
  if (!row.link) return 'sin-pieza';
  if (media === null) return 'sin-acceso';
  if (media && media.length > 0) return 'lista';
  if (row.link.kind === 'other') return 'lista';
  return 'sin-material';
}

async function finish(draft: Draft): Promise<ContentPiece> {
  const media = draft.media ?? (await mediaFor(draft));
  return { ...draft, media: media ?? [], status: statusFor(draft, media) };
}

export async function loadBrandContent(
  brandId: string,
  sources: { sheetUrl: string | null; folderUrl: string | null },
  window: { from: string; to: string },
): Promise<ContentPiece[]> {
  const cacheKey = `${brandId}|${window.from}|${window.to}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.pieces;

  const sheetId = spreadsheetIdFromUrl(sources.sheetUrl);
  const folderId = folderIdFromUrl(sources.folderUrl);
  const [rows, drive] = await Promise.all([
    sheetId ? readPlannedRows(sheetId, monthsInWindow(window.from, window.to)) : Promise.resolve([]),
    folderId
      ? scanInstagramFolder(folderId, window).catch((err) => {
          if (unreadable(err)) return { feedFolders: [], storyDays: [] };
          throw err;
        })
      : Promise.resolve({ feedFolders: [], storyDays: [] }),
  ]);

  const drafts = mergeSheetAndDrive({
    rows: rows.filter((r) => !r.date || (r.date >= window.from && r.date <= window.to)),
    ...drive,
  });
  const pieces = await mapLimited(drafts, CONCURRENCY, finish);
  pieces.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.time ?? '').localeCompare(b.time ?? ''));
  cache.set(cacheKey, { at: Date.now(), pieces });
  return pieces;
}
