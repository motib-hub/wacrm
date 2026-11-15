import { describe, expect, it } from 'vitest';
import { navForMarcasRole } from './nav';

describe('navForMarcasRole', () => {
  it('adds Marcas for admins, shows only Marcas to the team, leaves others alone', () => {
    expect(navForMarcasRole(['inbox'], 'marcas', 'admin')).toEqual(['inbox', 'marcas']);
    expect(navForMarcasRole(['inbox'], 'marcas', 'equipo')).toEqual(['marcas']);
    expect(navForMarcasRole(['inbox'], 'marcas', null)).toEqual(['inbox']);
  });
});
