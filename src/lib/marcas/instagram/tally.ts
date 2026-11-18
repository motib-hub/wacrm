import type { ContentPiece } from '../content/types';

/**
 * Planned vs published, per brand and day (pure; tally.test.ts).
 *
 * Days are Argentina's calendar days: the brands publish for Argentina,
 * the plan's dates are Argentine dates, and the team may be elsewhere.
 * Argentina has no daylight saving time, so UTC−3 is exact all year.
 */

const ART_OFFSET_MS = 3 * 3_600_000;

/** "2026-11-18T02:10:00+0000" → "2026-11-17" (Argentina). */
export function argentinaDate(iso: string | Date): string {
  const ms = typeof iso === 'string' ? Date.parse(iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : iso.getTime();
  return new Date(ms - ART_OFFSET_MS).toISOString().slice(0, 10);
}

/** Calendar day `days` after (or before) an ISO date. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface PublishedItem {
  id: string;
  brand_id: string;
  kind: 'feed' | 'story';
  media_type: string;
  taken_at: string;
  permalink: string | null;
}

export interface Counts {
  feed: number;
  stories: number;
}

export const isStoryPiece = (p: Pick<ContentPiece, 'formats'>) =>
  p.formats.length > 0 && p.formats.every((f) => f === 'historia');

/**
 * What the plan expects that day. A feed piece is one post; a stories
 * piece is one story per file (a day folder with 4 placas = 4 stories),
 * at least one when it has no files yet.
 */
export function plannedCounts(pieces: ContentPiece[]): Counts {
  const out: Counts = { feed: 0, stories: 0 };
  for (const p of pieces) {
    if (isStoryPiece(p)) out.stories += Math.max(1, p.media.length);
    else out.feed += 1;
  }
  return out;
}

export function publishedCounts(items: PublishedItem[]): Counts {
  const out: Counts = { feed: 0, stories: 0 };
  for (const item of items) {
    if (item.kind === 'story') out.stories += 1;
    else out.feed += 1;
  }
  return out;
}

export type DayVerdict =
  | 'done' //        everything planned went out
  | 'partial' //     some of it
  | 'none' //        nothing, with something planned
  | 'unplanned' //   nothing planned (whatever went out is a bonus)
  | 'pending' //     today, still in progress
  | 'unknown'; //    before the first read: stories can't be checked

export interface DayTally {
  date: string;
  planned: Counts;
  published: Counts;
  /** Stories of that day were never seen by a sync (before the first one). */
  storiesUnknown: boolean;
  verdict: DayVerdict;
}

export function verdictFor(planned: Counts, published: Counts, opts: { today: boolean; storiesUnknown: boolean }): DayVerdict {
  const plannedTotal = planned.feed + planned.stories;
  if (plannedTotal === 0) return 'unplanned';
  if (opts.storiesUnknown && planned.stories > 0) return 'unknown';
  const met = Math.min(published.feed, planned.feed) + Math.min(published.stories, planned.stories);
  if (met >= plannedTotal) return 'done';
  if (opts.today) return 'pending';
  return met === 0 ? 'none' : 'partial';
}

/**
 * One brand's days: the plan's pieces and the published items are
 * grouped by Argentine date; `firstSyncAt` (null = never read) decides
 * which days' stories can be judged.
 */
export function tallyDays(
  dates: string[],
  pieces: ContentPiece[],
  items: PublishedItem[],
  opts: { today: string; firstSyncAt: string | null },
): DayTally[] {
  const firstDay = opts.firstSyncAt ? argentinaDate(opts.firstSyncAt) : null;
  return dates.map((date) => {
    const planned = plannedCounts(pieces.filter((p) => p.date === date));
    const published = publishedCounts(items.filter((i) => argentinaDate(i.taken_at) === date));
    const storiesUnknown = firstDay === null || date < firstDay;
    return {
      date,
      planned,
      published,
      storiesUnknown,
      verdict: verdictFor(planned, published, { today: date === opts.today, storiesUnknown }),
    };
  });
}
