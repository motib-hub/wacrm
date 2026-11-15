import { describe, expect, it } from 'vitest';
import { monthsInWindow, spreadsheetIdFromUrl, statusFor } from './load';

describe('loader helpers', () => {
  it('lists the months a window touches, across a year change', () => {
    expect([...monthsInWindow('2026-11-20', '2027-01-05')]).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(spreadsheetIdFromUrl('https://docs.google.com/spreadsheets/d/AbC_1-2/edit')).toBe('AbC_1-2');
  });

  it('derives the card status from the row and its folder', () => {
    const base = { key: 'k', date: null, time: null, title: 't', formats: [], copy: '', story: '', notes: '', scheduled: false };
    const folder = { kind: 'drive-folder' as const, id: 'f', url: 'u' };
    expect(statusFor({ ...base, link: null }, [])).toBe('sin-pieza');
    expect(statusFor({ ...base, link: folder }, [])).toBe('sin-material');
    expect(statusFor({ ...base, link: folder }, null)).toBe('sin-acceso');
    expect(statusFor({ ...base, link: folder }, [{ id: '1', name: 'a', kind: 'image', thumbnail: null, viewUrl: '' }])).toBe('lista');
    expect(statusFor({ ...base, link: folder, scheduled: true }, [])).toBe('programada');
    expect(statusFor({ ...base, link: { kind: 'instagram', url: 'u' } }, [])).toBe('publicada');
  });
});
