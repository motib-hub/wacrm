import type { ContentPiece, PieceStatus } from './types';

/** A stories-only piece (a row ticked just "Historia", or a Stories day from Drive). */
export const isStoryPiece = (p: Pick<ContentPiece, 'formats'>) =>
  p.formats.length > 0 && p.formats.every((f) => f === 'historia');

/** Content pieces grouped by what the all-brands views filter on: done, on track, missing. */
export type ContentBucket = 'done' | 'ready' | 'missing';

export function contentBucket(status: PieceStatus): ContentBucket | null {
  if (status === 'publicada' || status === 'programada') return 'done';
  if (status === 'lista') return 'ready';
  if (status === 'sin-pieza' || status === 'sin-material') return 'missing';
  return null; // sin-acceso: can't tell
}
