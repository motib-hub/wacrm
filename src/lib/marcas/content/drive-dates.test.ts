import { describe, expect, it } from 'vitest';
import { dateFromName, monthFromFolderName } from './drive-dates';
import { monthFromTabTitle } from './sheet-parser';

const NOV_15 = new Date('2026-11-15T12:00:00');

describe('monthFromFolderName', () => {
  it('reads the month folders the brands use', () => {
    expect(monthFromFolderName('11. Noviembre')).toBe(11);
    expect(monthFromFolderName('06. JUNIO')).toBe(6);
    expect(monthFromFolderName('Diciembre')).toBe(12);
    expect(monthFromFolderName('Archivo - hasta mayo 2026')).toBeNull();
    expect(monthFromFolderName('18-11')).toBeNull();
  });
});

describe('dateFromName', () => {
  it('reads full dates (Motib stories)', () => {
    expect(dateFromName('2026-11-16 lunes')).toEqual({ date: '2026-11-16', rest: 'lunes' });
  });

  it('reads day-month folders and files, using the month folder year', () => {
    expect(dateFromName('18-11', 2026)).toEqual({ date: '2026-11-18', rest: '' });
    expect(dateFromName('03-03. Carrusel Iceferas', 2027)).toEqual({ date: '2027-03-03', rest: 'Carrusel Iceferas' });
    expect(dateFromName('01-11. 02.jpg', 2026)).toEqual({ date: '2026-11-01', rest: '02' });
  });

  it('infers the nearest year when there is no month folder', () => {
    expect(dateFromName('05-01', undefined, NOV_15)?.date).toBe('2027-01-05');
    expect(dateFromName('20-10', undefined, NOV_15)?.date).toBe('2026-10-20');
  });

  it('ignores names that are not dates', () => {
    expect(dateFromName('Feed-01.jpg')).toBeNull();
    expect(dateFromName('icons')).toBeNull();
    expect(dateFromName('40-11')).toBeNull();
  });
});

describe('monthFromTabTitle without a year', () => {
  it('picks the nearest occurrence (Maracaibo tabs)', () => {
    expect(monthFromTabTitle("Nov'", NOV_15)).toEqual({ year: 2026, month: 11 });
    expect(monthFromTabTitle('Dic', NOV_15)).toEqual({ year: 2026, month: 12 });
    expect(monthFromTabTitle("Ag'26", NOV_15)).toEqual({ year: 2026, month: 8 });
    expect(monthFromTabTitle('Nuevospilares', NOV_15)).toBeNull();
    expect(monthFromTabTitle('Comunidad 2026', NOV_15)).toBeNull();
  });
});
