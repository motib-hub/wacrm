import { isStoryPiece } from '../content/buckets';
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
  | 'unknown'; //    stories can't be checked (no read in time)

export interface DayTally {
  date: string;
  planned: Counts;
  published: Counts;
  /** Some of that day's stories may have vanished unseen (no read in time). */
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
 * The part of a day that can be judged, as "met of planned": stories
 * count only once they were seen by a sync, and extra stories never make
 * up for a missing post.
 */
export function dayScore(day: Pick<DayTally, 'planned' | 'published' | 'storiesUnknown'>): { met: number; total: number } {
  const stories = day.storiesUnknown ? 0 : 1;
  return {
    met: Math.min(day.published.feed, day.planned.feed) + stories * Math.min(day.published.stories, day.planned.stories),
    total: day.planned.feed + stories * day.planned.stories,
  };
}

const DAY_MS = 86_400_000;
/** UTC instant where an Argentine day starts (00:00 at UTC−3). */
const dayStart = (date: string) => Date.parse(`${date}T03:00:00Z`);

/**
 * Whether every story posted on `date` was visible to some read. A story
 * lives 24 h, so a story posted at t is caught if a read happens in
 * [t, t + 24 h]. That holds for the whole day when the reads between the
 * day's start and 24 h after its end leave no gap longer than 24 h,
 * start within 24 h of the day and reach past its end. Today is judged
 * so far: any read since midnight saw everything posted until then.
 */
export function storiesCovered(date: string, syncs: string[], today: string): boolean {
  const from = dayStart(date);
  const times = syncs.map((s) => Date.parse(s)).filter((t) => t >= from).sort((a, b) => a - b);
  if (date >= today) return times.length > 0;
  const to = from + DAY_MS; // end of the day
  const window = times.filter((t) => t <= to + DAY_MS);
  if (window.length === 0 || window[0] > from + DAY_MS || window[window.length - 1] < to) return false;
  return window.every((t, i) => i === 0 || t - window[i - 1] <= DAY_MS);
}

/**
 * One brand's days: the plan's pieces and the published items are
 * grouped by Argentine date; `syncs` (every successful read) decide
 * which days' stories can be judged.
 */
export function tallyDays(
  dates: string[],
  pieces: ContentPiece[],
  items: PublishedItem[],
  opts: { today: string; syncs: string[] },
): DayTally[] {
  return dates.map((date) => {
    const planned = plannedCounts(pieces.filter((p) => p.date === date));
    const published = publishedCounts(items.filter((i) => argentinaDate(i.taken_at) === date));
    const storiesUnknown = !storiesCovered(date, opts.syncs, opts.today);
    return {
      date,
      planned,
      published,
      storiesUnknown,
      verdict: verdictFor(planned, published, { today: date === opts.today, storiesUnknown }),
    };
  });
}
