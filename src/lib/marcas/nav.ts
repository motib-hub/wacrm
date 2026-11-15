import type { MarcasRole } from './types';

/**
 * The sidebar's flat upstream nav for a given Marcas role (fork seam).
 *
 *   not a member → the CRM nav, untouched (client accounts)
 *   member       → nothing here: the Motib HUB nav (src/components/hub)
 *                  renders the modules instead, CRM included for admins
 *   still loading→ nothing yet, so the team never sees the flat CRM nav
 *                  flash before the hub replaces it
 */
export function navForMarcasRole<T>(crmItems: T[], role: MarcasRole | null, loading: boolean): T[] {
  if (loading || role) return [];
  return crmItems;
}
