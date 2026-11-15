import { dateFromName, monthFromFolderName } from './drive-dates';
import { FOLDER_MIME, isMediaFile, listFolder, mapLimited, toMedia, type DriveFile } from './drive-api';
import type { DriveFeedFolder, DriveStoryDay } from './merge';

/**
 * Finds a brand's dated material under its Instagram folder:
 *   <root>/Feed/<NN. Mes>/<DD-MM[. título]>/   → one feed piece per folder
 *   <root>/Stories/<NN. Mes>/<DD-MM. NN>.jpg   → that day's stories
 *   <root>/Stories/<AAAA-MM-DD …>/             → Motib's layout
 * Only month folders inside the requested window are opened.
 */

const FEED = /^feed$/i;
const STORIES = /^(stories|historias)$/i;
const CONCURRENCY = 5;

interface Window {
  from: string;
  to: string;
}

const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const inWindow = (date: string, w: Window) => date >= w.from && date <= w.to;

/** The year a month folder belongs to, given the window it must fall in. */
function yearForMonth(month: number, w: Window): number | null {
  const [fy, fm] = w.from.split('-').map(Number);
  const [ty, tm] = w.to.split('-').map(Number);
  for (let y = fy; y <= ty; y++) {
    const start = y === fy ? fm : 1;
    const end = y === ty ? tm : 12;
    if (month >= start && month <= end) return y;
  }
  return null;
}

interface DatedEntry {
  file: DriveFile;
  date: string;
  rest: string;
  /** Folder the entry sits in (month folder or the section root). */
  parentId: string;
}

/** Dated children of a section, opening only the month folders in the window. */
async function datedEntries(sectionId: string, w: Window): Promise<DatedEntry[]> {
  const top = await listFolder(sectionId);
  const out: DatedEntry[] = [];
  const months: { id: string; year: number }[] = [];
  for (const f of top) {
    const month = f.mimeType === FOLDER_MIME ? monthFromFolderName(f.name) : null;
    if (month) {
      const year = yearForMonth(month, w);
      if (year) months.push({ id: f.id, year });
      continue;
    }
    const d = dateFromName(f.name);
    if (d && inWindow(d.date, w)) out.push({ file: f, ...d, parentId: sectionId });
  }
  const nested = await mapLimited(months, CONCURRENCY, async (m) =>
    (await listFolder(m.id)).flatMap((f) => {
      const d = dateFromName(f.name, m.year);
      return d && inWindow(d.date, w) ? [{ file: f, ...d, parentId: m.id }] : [];
    }),
  );
  return [...out, ...nested.flat()];
}

export async function scanInstagramFolder(
  rootId: string,
  w: Window,
): Promise<{ feedFolders: DriveFeedFolder[]; storyDays: DriveStoryDay[] }> {
  const root = await listFolder(rootId);
  const feedRoot = root.find((f) => f.mimeType === FOLDER_MIME && FEED.test(f.name.trim()));
  const storiesRoot = root.find((f) => f.mimeType === FOLDER_MIME && STORIES.test(f.name.trim()));

  const [feedEntries, storyEntries] = await Promise.all([
    feedRoot ? datedEntries(feedRoot.id, w) : Promise.resolve([]),
    storiesRoot ? datedEntries(storiesRoot.id, w) : Promise.resolve([]),
  ]);

  const feedFolders = feedEntries
    .filter((e) => e.file.mimeType === FOLDER_MIME)
    .map((e) => ({ id: e.file.id, date: e.date, title: e.rest }));

  // Stories: loose dated files group by day; dated folders contribute their files.
  const days = new Map<string, DriveStoryDay>();
  const add = (date: string, media: ReturnType<typeof toMedia>[], url: string) => {
    const day = days.get(date) ?? { date, media: [], folderUrl: url };
    day.media.push(...media);
    days.set(date, day);
  };
  for (const e of storyEntries) {
    if (e.file.mimeType !== FOLDER_MIME && isMediaFile(e.file)) add(e.date, [toMedia(e.file)], folderUrl(e.parentId));
  }
  const dayFolders = storyEntries.filter((e) => e.file.mimeType === FOLDER_MIME);
  const listed = await mapLimited(dayFolders, CONCURRENCY, async (e) => ({
    e,
    files: (await listFolder(e.file.id)).filter(isMediaFile),
  }));
  for (const { e, files } of listed) add(e.date, files.map(toMedia), folderUrl(e.file.id));

  const storyDays = [...days.values()].map((d) => ({ ...d, media: d.media.sort((a, b) => a.name.localeCompare(b.name)) }));
  return { feedFolders, storyDays };
}
