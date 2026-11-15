import { describe, expect, it } from 'vitest';
import { navForMarcasRole } from './nav';

describe('navForMarcasRole', () => {
  it('leaves the flat CRM nav to non-members and hands members to the hub', () => {
    expect(navForMarcasRole(['inbox'], null, false)).toEqual(['inbox']);
    expect(navForMarcasRole(['inbox'], 'admin', false)).toEqual([]);
    expect(navForMarcasRole(['inbox'], 'equipo', false)).toEqual([]);
  });

  it('shows nothing while membership is still loading', () => {
    expect(navForMarcasRole(['inbox'], null, true)).toEqual([]);
  });
});
