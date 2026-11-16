import type { PieceStatus } from './types';

/** Content pieces grouped by what the all-brands views filter on: done, on track, missing. */
export type ContentBucket = 'done' | 'ready' | 'missing';

export function contentBucket(status: PieceStatus): ContentBucket | null {
  if (status === 'publicada' || status === 'programada') return 'done';
  if (status === 'lista') return 'ready';
  if (status === 'sin-pieza' || status === 'sin-material') return 'missing';
  return null; // sin-acceso: can't tell
}
