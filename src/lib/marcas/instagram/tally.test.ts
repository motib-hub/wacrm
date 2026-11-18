import { describe, expect, it } from 'vitest';
import type { ContentPiece, PieceMedia } from '../content/types';
import { argentinaDate, plannedCounts, shiftDate, tallyDays, verdictFor, type PublishedItem } from './tally';

const media = (id: string): PieceMedia => ({ id, name: id, kind: 'image', thumbnail: null, viewUrl: '', manual: false });
const piece = (o: Partial<ContentPiece>): ContentPiece => ({
  key: 'k', date: '2026-11-17', time: null, title: 't', formats: ['reel'], copy: '', story: '', notes: '',
  scheduled: false, link: null, status: 'lista', media: [], origin: 'sheet', ...o,
});
const item = (o: Partial<PublishedItem>): PublishedItem => ({
  id: Math.random().toString(36).slice(2), brand_id: 'b', kind: 'feed', media_type: 'IMAGE',
  taken_at: '2026-11-17T15:00:00+0000', permalink: null, ...o,
});

describe('argentinaDate', () => {
  it('reads Meta timestamps as Argentine calendar days', () => {
    expect(argentinaDate('2026-11-18T02:10:00+0000')).toBe('2026-11-17');
    expect(argentinaDate('2026-11-18T03:00:00+0000')).toBe('2026-11-18');
    expect(argentinaDate('2026-11-18T02:59:59.000Z')).toBe('2026-11-17');
  });

  it('shifts calendar days across months', () => {
    expect(shiftDate('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31');
  });
});

describe('plannedCounts', () => {
  it('counts one post per feed piece and one story per file', () => {
    expect(
      plannedCounts([
        piece({ formats: ['carrusel'], media: [media('a'), media('b')] }),
        piece({ formats: ['historia'], media: [media('s1'), media('s2'), media('s3')] }),
        piece({ formats: ['historia'] }),
      ]),
    ).toEqual({ feed: 1, stories: 4 });
  });
});

describe('verdictFor', () => {
  const past = { today: false, storiesUnknown: false };
  it('grades a closed day', () => {
    expect(verdictFor({ feed: 1, stories: 4 }, { feed: 1, stories: 4 }, past)).toBe('done');
    expect(verdictFor({ feed: 1, stories: 4 }, { feed: 1, stories: 3 }, past)).toBe('partial');
    expect(verdictFor({ feed: 1, stories: 4 }, { feed: 0, stories: 0 }, past)).toBe('none');
    expect(verdictFor({ feed: 0, stories: 0 }, { feed: 2, stories: 0 }, past)).toBe('unplanned');
  });

  it('does not let extra stories make up for a missing post', () => {
    expect(verdictFor({ feed: 1, stories: 2 }, { feed: 0, stories: 5 }, past)).toBe('partial');
  });

  it('keeps today open and refuses to judge unseen stories', () => {
    expect(verdictFor({ feed: 1, stories: 0 }, { feed: 0, stories: 0 }, { today: true, storiesUnknown: false })).toBe('pending');
    expect(verdictFor({ feed: 0, stories: 3 }, { feed: 0, stories: 0 }, { today: false, storiesUnknown: true })).toBe('unknown');
  });
});

describe('tallyDays', () => {
  it('lines up the plan and Instagram by day, with stories unknown before the first read', () => {
    const days = tallyDays(
      ['2026-11-16', '2026-11-17'],
      [
        piece({ date: '2026-11-16', formats: ['historia'], media: [media('x')] }),
        piece({ date: '2026-11-17', formats: ['reel'] }),
        piece({ date: '2026-11-17', formats: ['historia'], media: [media('y'), media('z')] }),
      ],
      [
        item({ kind: 'feed', taken_at: '2026-11-17T20:00:00+0000' }),
        item({ kind: 'story', taken_at: '2026-11-17T12:00:00+0000' }),
        item({ kind: 'story', taken_at: '2026-11-18T01:30:00+0000' }), // 22:30 in Argentina
      ],
      { today: '2026-11-18', firstSyncAt: '2026-11-17T10:00:00Z' },
    );
    expect(days[0]).toMatchObject({ date: '2026-11-16', storiesUnknown: true, verdict: 'unknown' });
    expect(days[1]).toMatchObject({
      planned: { feed: 1, stories: 2 },
      published: { feed: 1, stories: 2 },
      verdict: 'done',
    });
  });
});
