import { describe, expect, it } from 'vitest';
import { bucketByDate, gridWindow, monthGrid, shiftMonth } from './calendar';

describe('monthGrid', () => {
  it('spans whole Monday-first weeks around the month', () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const weeks = monthGrid(2026, 11);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ iso: '2026-10-26', day: 26, inMonth: false });
    expect(weeks[0][6]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
    const last = weeks[weeks.length - 1];
    expect(last[0].iso).toBe('2026-11-30');
    expect(last[6]).toEqual({ iso: '2026-12-06', day: 6, inMonth: false });
    expect(gridWindow(weeks)).toEqual({ from: '2026-10-26', to: '2026-12-06' });
  });

  it('adds no padding when the month starts on Monday', () => {
    // June 2026 starts on a Monday.
    expect(monthGrid(2026, 6)[0][0].iso).toBe('2026-06-01');
  });
});

describe('shiftMonth', () => {
  it('crosses year boundaries', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('bucketByDate', () => {
  it('groups by date and drops undated items', () => {
    const map = bucketByDate(
      [{ d: '2026-11-20' }, { d: null }, { d: '2026-11-20' }, { d: '2026-11-21' }],
      (x) => x.d,
    );
    expect(map.get('2026-11-20')).toHaveLength(2);
    expect(map.get('2026-11-21')).toHaveLength(1);
    expect(map.size).toBe(2);
  });
});
