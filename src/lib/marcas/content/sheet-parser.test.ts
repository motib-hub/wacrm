import { describe, expect, it } from 'vitest';
import { monthFromTabTitle, parseLink, parsePlanningTab, type SheetCell } from './sheet-parser';

const c = (formattedValue = '', hyperlink?: string): SheetCell => ({ formattedValue, hyperlink });

// Synthetic grid shaped like the shared template (no real client data).
const HEADER = [c('NOVIEMBRE'), c('DÍA '), c('FECHA'), c('HORA'), c('PILAR DE CONTENIDO'), c('PIEZA TERMINADA OK PARA SUBIR'), c('FORMATO'), c(), c(), c('COPY'), c('OBSERVACIONES DE PUBLICACION'), c('PROGRAMADO')];
const SUB = [c(), c(), c(), c(), c(), c(), c('REEL'), c('CARRU'), c('IMG')];
const row = (day: string, title: string, link: string | undefined, f: [boolean, boolean, boolean], copy = '', scheduled = false) => [
  c('Semana 1'), c('Lunes'), c(day), c(''), c(title), c('Pieza', link),
  c(String(f[0]).toUpperCase()), c(String(f[1]).toUpperCase()), c(String(f[2]).toUpperCase()),
  c(copy), c(''), c(String(scheduled).toUpperCase()),
];

describe('monthFromTabTitle', () => {
  it('reads the month tabs the sheets use', () => {
    expect(monthFromTabTitle("Nov'26")).toEqual({ year: 2026, month: 11 });
    expect(monthFromTabTitle("Ene'27")).toEqual({ year: 2027, month: 1 });
    expect(monthFromTabTitle('Diciembre 2026')).toEqual({ year: 2026, month: 12 });
    expect(monthFromTabTitle('Pilares general')).toBeNull();
    expect(monthFromTabTitle('Sin fecha')).toBeNull();
  });
});

describe('parseLink', () => {
  it('recognises Drive folders, Drive files and Instagram posts', () => {
    expect(parseLink('https://drive.google.com/drive/folders/abc-123')).toMatchObject({ kind: 'drive-folder', id: 'abc-123' });
    expect(parseLink('https://drive.google.com/file/d/XYZ_9/view?usp=sharing')).toMatchObject({ kind: 'drive-file', id: 'XYZ_9' });
    expect(parseLink('https://www.instagram.com/reels/DewA6/')).toMatchObject({ kind: 'instagram' });
    expect(parseLink('Pieza')).toBeNull();
  });
});

describe('parsePlanningTab', () => {
  const grid = [
    HEADER,
    SUB,
    row('4', 'Qué es el branding', 'https://drive.google.com/drive/folders/f1', [false, true, false], 'Copy 1', true),
    row('8', 'Escalabilidad', undefined, [true, false, false]),
    row('15', '', undefined, [false, false, false]), // template filler
    row('19', 'Paletas', 'https://www.instagram.com/reels/abc/', [true, false, false]),
  ];

  it('finds columns by header and resolves dates from the tab month', () => {
    const rows = parsePlanningTab("Nov'26", grid);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      key: "Nov'26:3",
      date: '2026-11-04',
      title: 'Qué es el branding',
      formats: ['carrusel'],
      copy: 'Copy 1',
      scheduled: true,
      link: { kind: 'drive-folder', id: 'f1' },
    });
    expect(rows[1]).toMatchObject({ date: '2026-11-08', formats: ['reel'], link: null });
    expect(rows[2].link).toMatchObject({ kind: 'instagram' });
  });

  it('copes with an extra HISTORIA column shifting copy to the right', () => {
    const header = [...HEADER.slice(0, 9), c('HISTORIA'), c('COPY'), c('OBSERVACIONES'), c('PROGRAMADO')];
    const data = [...row('2', 'Lanzamiento', undefined, [true, false, false]).slice(0, 9), c('Story 1'), c('El copy'), c(''), c('FALSE')];
    const [parsed] = parsePlanningTab("Dic'26", [header, SUB, data]);
    expect(parsed).toMatchObject({ date: '2026-12-02', story: 'Story 1', copy: 'El copy' });
  });

  it('returns nothing for tabs without a FECHA header', () => {
    expect(parsePlanningTab('Pilares general', [[c('PILAR'), c('DESCRIPCIÓN')]])).toEqual([]);
  });
});

describe('rows that share a day', () => {
  it('inherit the date of the row above when FECHA is blank', () => {
    const header = [c('MES'), c('DÍA'), c('FECHA'), c('HORA'), c('TEMA'), c('PIEZA'), c('UBICACIÓN'), c(), c('COPY')];
    const sub = [c(), c(), c(), c(), c(), c(), c('FEED'), c('HISTORIA')];
    const r = (day: string, title: string, feed: boolean, story: boolean) =>
      [c(), c(), c(day), c(), c(title), c('Pieza', 'https://drive.google.com/file/d/x' + title), c(String(feed).toUpperCase()), c(String(story).toUpperCase()), c()];
    const rows = parsePlanningTab("Nov'", [header, sub, r('2', 'A', true, false), r('', 'B', false, true), r('3', 'C', false, true)]);
    expect(rows.map((x) => [x.title, x.date, x.formats])).toEqual([
      ['A', expect.stringMatching(/-11-02$/), ['feed']],
      ['B', expect.stringMatching(/-11-02$/), ['historia']],
      ['C', expect.stringMatching(/-11-03$/), ['historia']],
    ]);
  });
});
