import type { PieceFormat, PieceLink, PlannedRow } from './types';

/**
 * Turns one month tab of a "Planificación - X" sheet into planned rows.
 *
 * The brands' sheets share a template but not a fixed layout (Krema,
 * Prince and Scala3 add a HISTORIA column; MOTIB has extra trailing
 * columns), so columns are found by their header text, never by
 * position. Pure function: unit-tested in sheet-parser.test.ts.
 */

export interface SheetCell {
  formattedValue?: string;
  hyperlink?: string;
}

const MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

/** "Nov'26", "nov 2026", "Noviembre 26" → { year: 2026, month: 11 }; else null. */
export function monthFromTabTitle(title: string): { year: number; month: number } | null {
  const m = normalize(title).match(/^([A-Z]{3})[A-Z]*\W*(\d{2}|\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return { year, month };
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

type Role = 'date' | 'time' | 'title' | 'piece' | 'copy' | 'notes' | 'scheduled' | 'story';

const HEADER_RULES: [Role, RegExp][] = [
  ['date', /^FECHA/],
  ['time', /^HORA/],
  ['title', /^(PILAR|TEMA|TITULO)/],
  ['piece', /^PIEZA/],
  ['copy', /^COPY/],
  ['notes', /^OBSERV/],
  ['scheduled', /^(PROGRAMADO|SUBIDO)/],
  ['story', /^HISTORIA/],
];

const FORMAT_RULES: [PieceFormat, RegExp][] = [
  ['reel', /^REEL/],
  ['carrusel', /^CARRU/],
  ['imagen', /^(IMG|IMAGEN|FOTO)/],
  ['historia', /^HISTORIA/],
];

export function parseLink(url: string | undefined): PieceLink | null {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const folder = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/);
  if (folder) return { kind: 'drive-folder', id: folder[1], url };
  const file =
    url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ??
    url.match(/drive\.google\.com\/open\?id=([\w-]+)/);
  if (file) return { kind: 'drive-file', id: file[1], url };
  if (/instagram\.com\//.test(url)) return { kind: 'instagram', url };
  return { kind: 'other', url };
}

const text = (cell: SheetCell | undefined) => (cell?.formattedValue ?? '').trim();
const ticked = (cell: SheetCell | undefined) => text(cell).toUpperCase() === 'TRUE';

/** Day cell → ISO date. Accepts "4", "04/11", "4/11/2026" or "2026-11-04". */
function resolveDate(raw: string, month: { year: number; month: number } | null): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dm = raw.match(/^(\d{1,2})(?:[/.-](\d{1,2})(?:[/.-](\d{2,4}))?)?$/);
  if (!dm) return null;
  const day = Number(dm[1]);
  const mon = dm[2] ? Number(dm[2]) : month?.month;
  const yr = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : month?.year;
  if (!mon || !yr || day < 1 || day > 31 || mon > 12) return null;
  return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parsePlanningTab(tabTitle: string, grid: SheetCell[][]): PlannedRow[] {
  const headerIndex = grid.findIndex((row) => row.some((c) => /^FECHA/.test(normalize(text(c)))));
  if (headerIndex < 0) return [];

  const columns: Partial<Record<Role, number>> = {};
  grid[headerIndex].forEach((cell, i) => {
    const label = normalize(text(cell));
    for (const [role, rule] of HEADER_RULES) {
      if (columns[role] === undefined && rule.test(label)) columns[role] = i;
    }
  });

  // Format checkboxes are labelled on the row under the header
  // (REEL · CARRU · IMG · HISTORIA), grouped under one "FORMATO" cell.
  const formatColumns: [PieceFormat, number][] = [];
  const sub = grid[headerIndex + 1] ?? [];
  sub.forEach((cell, i) => {
    const label = normalize(text(cell));
    for (const [format, rule] of FORMAT_RULES) if (rule.test(label)) formatColumns.push([format, i]);
  });
  const firstDataRow = headerIndex + (formatColumns.length > 0 ? 2 : 1);
  const month = monthFromTabTitle(tabTitle);

  const rows: PlannedRow[] = [];
  for (let r = firstDataRow; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const at = (role: Role) => (columns[role] === undefined ? undefined : row[columns[role]!]);
    const pieceCell = at('piece');
    const link = parseLink(pieceCell?.hyperlink ?? (text(pieceCell).startsWith('http') ? text(pieceCell) : undefined));
    const title = text(at('title'));
    const copy = text(at('copy'));
    // Template rows carry a day name and the literal "Pieza" but nothing
    // planned. Only rows with a topic, a link or a copy are content.
    if (!title && !link && !copy) continue;

    rows.push({
      key: `${tabTitle}:${r + 1}`,
      date: resolveDate(text(at('date')), month),
      time: text(at('time')) || null,
      title,
      formats: formatColumns.filter(([, i]) => ticked(row[i])).map(([f]) => f),
      copy,
      story: columns.story !== undefined && !formatColumns.some(([, i]) => i === columns.story) ? text(at('story')) : '',
      notes: text(at('notes')),
      scheduled: ticked(at('scheduled')),
      link,
    });
  }
  return rows;
}
