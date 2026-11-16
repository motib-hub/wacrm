import { localIsoDate } from './board';

/**
 * Month grid for the Marcas calendar (pure; calendar.test.ts).
 *
 * Weeks start on Monday — the team plans Monday-to-Sunday — and the grid
 * always spans whole weeks, so it shows the tail of the previous month
 * and the head of the next one, like any wall calendar.
 */

export interface CalendarDay {
  iso: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
}

/** `month` is 1-12. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month - 1, 1 - offset);
  const last = new Date(year, month, 0);
  const trailing = 6 - ((last.getDay() + 6) % 7);
  const totalDays = offset + last.getDate() + trailing;

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ iso: localIsoDate(d), day: d.getDate(), inMonth: d.getMonth() === month - 1 });
  }
  return weeks;
}

/** The first and last ISO day the grid shows (what to load). */
export function gridWindow(weeks: CalendarDay[][]): { from: string; to: string } {
  const lastWeek = weeks[weeks.length - 1];
  return { from: weeks[0][0].iso, to: lastWeek[lastWeek.length - 1].iso };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Items bucketed by their date; items without a date are left out. */
export function bucketByDate<T>(items: T[], dateOf: (item: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const iso = dateOf(item);
    if (!iso) continue;
    const list = out.get(iso);
    if (list) list.push(item);
    else out.set(iso, [item]);
  }
  return out;
}
