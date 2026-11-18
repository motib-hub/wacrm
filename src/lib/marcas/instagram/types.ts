import type { SyncOutcome } from './sync';
import type { PublishedItem } from './tally';

/** GET /api/marcas/instagram — shared by the route and the summary page. */
export interface InstagramBrandState {
  username: string | null;
  outcome: SyncOutcome;
  firstSyncAt: string | null;
  lastSyncAt: string | null;
}

export interface InstagramResponse {
  /** false until the HUB's Meta token is stored (marcas_integrations 'meta'). */
  configured: boolean;
  brands: Record<string, InstagramBrandState>;
  items: PublishedItem[];
}
