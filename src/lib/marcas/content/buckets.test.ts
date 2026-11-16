import { describe, expect, it } from 'vitest';
import { contentBucket } from './buckets';

describe('contentBucket', () => {
  it('maps piece states to done / ready / missing', () => {
    expect(contentBucket('publicada')).toBe('done');
    expect(contentBucket('programada')).toBe('done');
    expect(contentBucket('lista')).toBe('ready');
    expect(contentBucket('sin-pieza')).toBe('missing');
    expect(contentBucket('sin-material')).toBe('missing');
    expect(contentBucket('sin-acceso')).toBeNull();
  });
});
