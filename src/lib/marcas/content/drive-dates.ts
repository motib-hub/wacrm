import { monthFromWord, nearestYear } from './sheet-parser';

/**
 * Reading dates out of the team's Drive names. Pure: tested in
 * drive-dates.test.ts.
 *
 * The standard layout (docs/FORK.md, "Contenido") is
 *   NN_Instagram/Feed/11. Noviembre/18-11. Título/      ← one folder per piece
 *   NN_Instagram/Stories/11. Noviembre/18-11. 01.jpg    ← or a "18-11" folder
 * and Motib's stories use full dates: Stories/2026-11-16 lunes/.
 */

/** "11. Noviembre", "06. JUNIO", "Noviembre" → 11; anything else → null. */
export function monthFromFolderName(name: string): number | null {
  const m = name.trim().match(/^(?:\d{1,2}\s*[.\-_)]\s*)?([A-Za-zÁÉÍÓÚáéíóú]{3,})\s*$/);
  return m ? monthFromWord(m[1]) : null;
}

export interface DatedName {
  date: string; // YYYY-MM-DD
  /** What follows the date, e.g. "Carrusel Iceferas" in "03-03. Carrusel Iceferas". */
  rest: string;
}

/**
 * "2026-11-16 lunes" → 2026-11-16; "18-11", "18-11. Título", "01-11. 01.jpg"
 * → day-month, with the year from the enclosing month folder (`year`) or,
 * failing that, the occurrence nearest to `today`.
 */
export function dateFromName(name: string, year?: number, today: Date = new Date()): DatedName | null {
  const full = name.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (full) return { date: `${full[1]}-${full[2]}-${full[3]}`, rest: clean(full[4]) };
  const dm = name.match(/^(\d{1,2})[-./](\d{1,2})(?![\d])(.*)$/);
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const y = year ?? nearestYear(month, today);
  return { date: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, rest: clean(dm[3]) };
}

/** Drop the separator and a file extension: ". Título.jpg" → "Título". */
function clean(rest: string): string {
  return rest.replace(/^[\s.\-_]+/, '').replace(/\.[a-z0-9]{2,4}$/i, '').trim();
}
