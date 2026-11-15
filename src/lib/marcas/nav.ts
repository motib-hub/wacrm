import type { MarcasRole } from './types';

/**
 * The sidebar's main nav for a given Marcas role (fork seam).
 *
 *   not a member → the CRM nav, untouched
 *   admin        → the CRM nav plus Marcas
 *   equipo       → Marcas only; their personal CRM account is not theirs to work
 */
export function navForMarcasRole<T>(crmItems: T[], marcasItem: T, role: MarcasRole | null): T[] {
  if (role === 'equipo') return [marcasItem];
  if (role === 'admin') return [...crmItems, marcasItem];
  return crmItems;
}
