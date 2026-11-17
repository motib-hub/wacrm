import { describe, expect, it } from 'vitest';
import { cleanManualNote, isManualName, isManualNoteName } from './manual';

describe('manual stories', () => {
  it('spots the files that go up by hand', () => {
    expect(isManualName('4 de 4 - CON STICKER.jpg')).toBe(true);
    expect(isManualName('3 de 3 - con_sticker.png')).toBe(true);
    expect(isManualName('1 de 4 - SALE SOLA 8.30.jpg')).toBe(false);
  });

  it('spots the instructions file', () => {
    expect(isManualNoteName('QUE SUBIR.txt')).toBe(true);
    expect(isManualNoteName('Qué subir - martes.txt')).toBe(true);
    expect(isManualNoteName('notas.txt')).toBe(false);
    expect(isManualNoteName('QUE SUBIR.jpg')).toBe(false);
  });

  it('keeps the how-to and drops the warning and the title', () => {
    const raw = [
      'OJO: las placas que dicen "SALE SOLA" están en esta carpeta solo para verlas.',
      '',
      'MARTES 17 DE NOV · QUÉ SUBIR',
      '',
      'Subí esto desde las 12:00:',
      '',
      '',
      '',
      '1) 1 de 1 - CON STICKER.jpg',
      '   sticker LINK → https://example.com',
    ].join('\r\n');
    expect(cleanManualNote(raw)).toBe('Subí esto desde las 12:00:\n\n1) 1 de 1 - CON STICKER.jpg\n   sticker LINK → https://example.com');
  });
});
