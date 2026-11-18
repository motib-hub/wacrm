import { supabaseAdmin } from '@/lib/ai/admin-client';
import { instagramAccounts, liveStories, recentPosts, type IgMedia } from './graph';

/**
 * Copies what each brand published on Instagram into `marcas_ig_media`.
 * Posts stay on the account, but stories vanish after 24 h, so this runs
 * on a schedule (twice a day, see .github/workflows/marcas-instagram.yml)
 * and also, throttled, whenever someone opens the summary.
 */

export interface SyncTarget {
  id: string;
  instagram_username: string | null;
}

/** Per brand: 'ok', 'not_linked' (no username, or the system user can't reach it) or 'error'. */
export type SyncOutcome = 'ok' | 'not_linked' | 'error';

const THROTTLE_MS = 10 * 60_000;
const lastSync = new Map<string, number>();

const toRow = (brandId: string, kind: 'feed' | 'story') => (m: IgMedia) => ({
  id: m.id,
  brand_id: brandId,
  kind,
  media_type: m.media_type,
  taken_at: m.timestamp,
  permalink: m.permalink ?? null,
});

async function syncOne(brand: SyncTarget, igUserId: string): Promise<void> {
  const [posts, stories] = await Promise.all([recentPosts(igUserId), liveStories(igUserId)]);
  const rows = [...posts.map(toRow(brand.id, 'feed')), ...stories.map(toRow(brand.id, 'story'))];
  const db = supabaseAdmin();
  if (rows.length > 0) {
    // seen_at is left out on purpose: it keeps the first time a row was seen.
    const { error } = await db.from('marcas_ig_media').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`marcas_ig_media upsert: ${error.message}`);
  }
  // first_at only on insert; last_at moves every time.
  const { error } = await db
    .from('marcas_ig_sync')
    .upsert({ brand_id: brand.id, last_at: new Date().toISOString() }, { onConflict: 'brand_id' });
  if (error) throw new Error(`marcas_ig_sync upsert: ${error.message}`);
}

/**
 * Syncs the given brands. `force` skips the throttle (the scheduled run);
 * otherwise a brand synced in the last THROTTLE_MS on this instance is
 * reported as 'ok' without calling Meta again.
 */
export async function syncBrands(brands: SyncTarget[], force = false): Promise<Record<string, SyncOutcome>> {
  const out: Record<string, SyncOutcome> = {};
  const linked = brands.filter((b) => b.instagram_username);
  for (const b of brands) if (!b.instagram_username) out[b.id] = 'not_linked';
  if (linked.length === 0) return out;

  let byUsername: Map<string, string>;
  try {
    byUsername = await instagramAccounts();
  } catch (err) {
    console.error('[marcas/instagram] accounts failed:', err);
    for (const b of linked) out[b.id] = 'error';
    return out;
  }

  await Promise.all(
    linked.map(async (brand) => {
      const igUserId = byUsername.get(brand.instagram_username!.replace(/^@/, '').toLowerCase());
      if (!igUserId) {
        out[brand.id] = 'not_linked';
        return;
      }
      if (!force && Date.now() - (lastSync.get(brand.id) ?? 0) < THROTTLE_MS) {
        out[brand.id] = 'ok';
        return;
      }
      try {
        await syncOne(brand, igUserId);
        lastSync.set(brand.id, Date.now());
        out[brand.id] = 'ok';
      } catch (err) {
        console.error(`[marcas/instagram] sync ${brand.id} failed:`, err);
        out[brand.id] = 'error';
      }
    }),
  );
  return out;
}
