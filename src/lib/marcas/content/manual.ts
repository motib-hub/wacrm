/**
 * Stories that Instagram's API can't publish on its own: anything with a
 * sticker (link, poll, question) has to be uploaded by hand from the
 * phone. The team marks them in the file name, and each day's folder
 * carries a "QUE SUBIR.txt" with the how-to (time, order, sticker, link):
 *
 *   Stories/2026-11-18 miércoles/
 *     1 de 4 - SALE SOLA 8.30.jpg     ← published automatically
 *     4 de 4 - CON STICKER.jpg        ← manual
 *     QUE SUBIR.txt                   ← instructions for the manual ones
 *
 * Pure: tested in manual.test.ts.
 */

const MANUAL_NAME = /con[\s_-]*sticker/i;
const NOTE_NAME = /^qu[eé][\s_-]*subir.*\.txt$/i;

/** A file the team has to upload by hand (its name says "CON STICKER"). */
export const isManualName = (name: string) => MANUAL_NAME.test(name);

/** The day's instructions file ("QUE SUBIR.txt"). */
export const isManualNoteName = (name: string) => NOTE_NAME.test(name.trim());

/**
 * The instructions as the card shows them: drops the warning about
 * "SALE SOLA" files (the card already tells them apart) and the title
 * line (the dialog already shows the date), and trims blank runs.
 */
export function cleanManualNote(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*ojo:/i.test(line) && !/qu[eé] subir\s*$/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
