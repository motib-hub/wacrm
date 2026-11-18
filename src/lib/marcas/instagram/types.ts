import type { PublishedItem } from './tally';

/** GET /api/marcas/instagram — shared by the route and the summary page. */
export interface InstagramBrandState {
  /** null = the brand isn't linked to an Instagram account. */
  username: string | null;
  /** Successful reads since the start of the window (see tally.storiesCovered). */
  syncs: string[];
  /** Latest read within the window; null = not read in it (new, or no partner access). */
  lastSyncAt: string | null;
}

export interface InstagramResponse {
  /** false until the HUB's Meta token is stored (marcas_integrations 'meta'). */
  configured: boolean;
  /** A read from Meta started in the background; ask again in a few seconds. */
  refreshing: boolean;
  /** More rows than one response carries: the window is too big. */
  truncated: boolean;
  brands: Record<string, InstagramBrandState>;
  items: PublishedItem[];
}
