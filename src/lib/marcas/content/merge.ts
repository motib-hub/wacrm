import type { ContentPiece, PieceMedia, PlannedRow } from './types';

/**
 * Joins the planning sheet with what the dated Drive folders hold.
 * Pure: tested in merge.test.ts.
 *
 * Rules, in order:
 *  1. A row's own "Pieza" link always wins.
 *  2. A feed row with a date and no link takes that day's Drive feed
 *     folder (first unclaimed one, in name order) — so uploading to the
 *     right folder is enough, nobody has to paste the link.
 *  3. Feed folders no row claimed become "unplanned" pieces, so material
 *     that isn't in the plan is visible rather than silently ignored.
 *  4. Each day's Drive stories become one "Historias" piece, minus any
 *     file a sheet row already links (Maracaibo lists stories row by row).
 */

export interface DriveFeedFolder {
  id: string;
  date: string;
  title: string;
}

export interface DriveStoryDay {
  date: string;
  media: PieceMedia[];
  /** The day's folder, or the month folder when stories are loose files. */
  folderUrl: string;
}

export interface MergeInput {
  rows: PlannedRow[];
  feedFolders: DriveFeedFolder[];
  storyDays: DriveStoryDay[];
}

export type Draft = Omit<ContentPiece, 'status' | 'media'> & { media?: PieceMedia[] };

const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const isStory = (r: PlannedRow) => r.formats.includes('historia') && !r.formats.some((f) => f !== 'historia');

export function mergeSheetAndDrive({ rows, feedFolders, storyDays }: MergeInput): Draft[] {
  const claimed = new Set<string>();
  for (const r of rows) if (r.link?.kind === 'drive-folder' || r.link?.kind === 'drive-file') claimed.add(r.link.id);

  const byDate = new Map<string, DriveFeedFolder[]>();
  for (const f of feedFolders) {
    if (claimed.has(f.id)) continue;
    byDate.set(f.date, [...(byDate.get(f.date) ?? []), f]);
  }

  const out: Draft[] = rows.map((row) => {
    if (row.link || !row.date || isStory(row)) return { ...row, origin: 'sheet' as const };
    const folder = byDate.get(row.date)?.shift();
    if (!folder) return { ...row, origin: 'sheet' as const };
    claimed.add(folder.id);
    return { ...row, origin: 'sheet' as const, link: { kind: 'drive-folder' as const, id: folder.id, url: folderUrl(folder.id) } };
  });

  for (const folders of byDate.values()) {
    for (const f of folders) {
      out.push({
        key: `drive:${f.id}`,
        date: f.date,
        time: null,
        title: f.title,
        formats: [],
        copy: '',
        story: '',
        notes: '',
        scheduled: false,
        link: { kind: 'drive-folder', id: f.id, url: folderUrl(f.id) },
        origin: 'drive',
      });
    }
  }

  for (const day of storyDays) {
    const media = day.media.filter((m) => !claimed.has(m.id));
    if (media.length === 0) continue;
    out.push({
      key: `stories:${day.date}`,
      date: day.date,
      time: null,
      title: '',
      formats: ['historia'],
      copy: '',
      story: '',
      notes: '',
      scheduled: false,
      link: { kind: 'drive-folder', id: day.folderUrl.split('/').pop() ?? '', url: day.folderUrl },
      origin: 'drive',
      media,
    });
  }
  return out;
}
