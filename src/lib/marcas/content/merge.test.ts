import { describe, expect, it } from 'vitest';
import { mergeSheetAndDrive } from './merge';
import type { PieceMedia, PlannedRow } from './types';

const row = (o: Partial<PlannedRow>): PlannedRow => ({
  key: o.key ?? 'k', date: null, time: null, title: 't', formats: [], copy: '', story: '',
  notes: '', scheduled: false, link: null, ...o,
});
const media = (id: string): PieceMedia => ({ id, name: id, kind: 'image', thumbnail: null, viewUrl: '', manual: false });

describe('mergeSheetAndDrive', () => {
  it('gives a linkless feed row the Drive folder of its date', () => {
    const out = mergeSheetAndDrive({
      rows: [row({ key: 'a', date: '2026-11-18', formats: ['carrusel'] })],
      feedFolders: [{ id: 'F18', date: '2026-11-18', title: 'Paletas' }],
      storyDays: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'a', origin: 'sheet', link: { kind: 'drive-folder', id: 'F18' } });
  });

  it('keeps the row link and does not reuse its folder', () => {
    const out = mergeSheetAndDrive({
      rows: [row({ key: 'a', date: '2026-11-04', link: { kind: 'drive-folder', id: 'F04', url: 'u' } })],
      feedFolders: [{ id: 'F04', date: '2026-11-04', title: '' }],
      storyDays: [],
    });
    expect(out).toHaveLength(1);
  });

  it('surfaces folders no row claims as unplanned pieces', () => {
    const out = mergeSheetAndDrive({
      rows: [],
      feedFolders: [{ id: 'F20', date: '2026-11-20', title: 'Reel Söft' }],
      storyDays: [],
    });
    expect(out[0]).toMatchObject({ origin: 'drive', date: '2026-11-20', title: 'Reel Söft' });
  });

  it('adds one stories piece per day, without files a row already links', () => {
    const out = mergeSheetAndDrive({
      rows: [row({ key: 's', date: '2026-11-02', formats: ['historia'], link: { kind: 'drive-file', id: 'S1', url: 'u' } })],
      feedFolders: [],
      storyDays: [
        { date: '2026-11-02', media: [media('S1'), media('S2')], folderUrl: 'https://drive.google.com/drive/folders/M' },
        { date: '2026-11-03', media: [media('S1')], folderUrl: 'https://drive.google.com/drive/folders/M' },
      ],
    });
    const stories = out.filter((p) => p.key.startsWith('stories:'));
    expect(stories).toHaveLength(1);
    expect(stories[0].media?.map((m) => m.id)).toEqual(['S2']);
  });

  it('never pairs a story row with a feed folder', () => {
    const out = mergeSheetAndDrive({
      rows: [row({ key: 'h', date: '2026-11-10', formats: ['historia'] })],
      feedFolders: [{ id: 'F10', date: '2026-11-10', title: '' }],
      storyDays: [],
    });
    expect(out.find((p) => p.key === 'h')?.link).toBeNull();
    expect(out.find((p) => p.key === 'drive:F10')).toBeTruthy();
  });

  it('carries the how-to only while the day still has a by-hand file', () => {
    const url = 'https://drive.google.com/drive/folders/D';
    const out = mergeSheetAndDrive({
      rows: [row({ key: 's', date: '2026-11-18', formats: ['historia'], link: { kind: 'drive-file', id: 'M1', url: 'u' } })],
      feedFolders: [],
      storyDays: [
        { date: '2026-11-17', media: [{ ...media('M2'), manual: true }], folderUrl: url, note: 'Subí desde las 12' },
        { date: '2026-11-18', media: [{ ...media('M1'), manual: true }, media('A1')], folderUrl: url, note: 'Subí desde las 12' },
      ],
    });
    expect(out.find((p) => p.key === 'stories:2026-11-17')?.manualNote).toBe('Subí desde las 12');
    expect(out.find((p) => p.key === 'stories:2026-11-18')?.manualNote).toBeUndefined();
  });
});
