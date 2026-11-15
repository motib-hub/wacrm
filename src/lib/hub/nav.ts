import type { MarcasRole } from '@/lib/marcas/types';

/**
 * Motib HUB navigation (fork-only). Pure, so it is unit-tested directly.
 *
 * The hub is what Marcas members (the agency team) see: the sidebar is
 * split into modules that fold open — MARCAS, and for admins the whole
 * upstream CRM as one more module. Client accounts are not members and
 * keep upstream's flat CRM nav untouched.
 *
 * The CRM module does not copy upstream's nav list; the sidebar hands
 * it in, so a section upstream adds tomorrow shows up in the hub with
 * no change here.
 */

export type HubGroupKey = 'marcas' | 'crm';

export interface HubGroup<T> {
  key: HubGroupKey;
  items: T[];
}

/** The modules a role sees, in order. Empty for non-members (no hub). */
export function hubGroups<T>(role: MarcasRole | null, marcasItems: T[], crmItems: T[]): HubGroup<T>[] {
  if (role === 'admin') return [{ key: 'marcas', items: marcasItems }, { key: 'crm', items: crmItems }];
  if (role === 'equipo') return [{ key: 'marcas', items: marcasItems }];
  return [];
}

/**
 * Whether a nav link is the current page. A link matches its own path
 * and anything below it, unless a sibling link is a closer match — so
 * `/marcas/tareas` lights "Tareas", not "Clientes" (`/marcas`), while a
 * brand page such as `/marcas/rodimar` still lights "Clientes".
 * `/dashboard` only matches itself (upstream's rule).
 */
export function isHubLinkActive(href: string, pathname: string, siblings: readonly string[]): boolean {
  const matches = (h: string) =>
    pathname === h || (h !== '/dashboard' && pathname.startsWith(`${h}/`));
  if (!matches(href)) return false;
  return !siblings.some((other) => other !== href && other.length > href.length && matches(other));
}

/** localStorage key for the folded modules. Per browser, a convenience only. */
export const HUB_COLLAPSED_STORAGE_KEY = 'motib-hub:nav-collapsed';

/** Reads the stored folded-module list, ignoring anything malformed. */
export function parseCollapsed(raw: string | null): Set<HubGroupKey> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((k): k is HubGroupKey => k === 'marcas' || k === 'crm'));
  } catch {
    return new Set();
  }
}
