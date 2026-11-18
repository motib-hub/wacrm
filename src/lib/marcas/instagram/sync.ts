import { supabaseAdmin } from '@/lib/ai/admin-client';
import { instagramAccounts, liveStories, recentPosts, type IgMedia } from './graph';

/**
 * Copies what each brand published on Instagram into `marcas_ig_media`
 * and logs each successful read in `marcas_ig_sync_log`. Posts stay on
 * the account, but stories vanish after 24 h, so this runs on a schedule
 * (twice a day, .github/workflows/marcas-instagram.yml) and also,
 * throttled, when someone opens the summary.
 *
 * The throttle reads the log, not memory: serverless instances don't
 * share memory, so an in-process timer wouldn't hold across them.
 */

export interface SyncTarget {
  id: string;
  instagram_username: string | null;
}

/**
 * Per brand: 'ok' (read now or recently), 'not_linked' (no username, or
 * the system user can't reach that account) or 'error' (Meta failed this
 * time; rows already stored are still valid).
 */
export type SyncOutcome = 'ok' | 'not_linked' | 'error';

const THROTTLE_MS = 10 * 60_000;
const LOG_KEEP_DAYS = 90;

const toRow = (brandId: string, kind: 'feed' | 'story') => (m: IgMedia) => ({
  id: m.id,
  brand_id: brandId,
  kind,
  media_type: m.media_type,
  taken_at: m.timestamp,
  permalink: m.permalink ?? null,
});

async function syncOne(brandId: string, igUserId: string): Promise<void> {
  const [posts, stories] = await Promise.all([recentPosts(igUserId), liveStories(igUserId)]);
  const rows = [...posts.map(toRow(brandId, 'feed')), ...stories.map(toRow(brandId, 'story'))];
  const db = supabaseAdmin();
  if (rows.length > 0) {
    // seen_at is left out on purpose: it keeps the first time a row was seen.
    const { error } = await db.from('marcas_ig_media').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`marcas_ig_media upsert: ${error.message}`);
  }
  const { error } = await db.from('marcas_ig_sync_log').insert({ brand_id: brandId });
  if (error) throw new Error(`marcas_ig_sync_log insert: ${error.message}`);
}

/**
 * Brands that would be read now: linked and not read in the last
 * THROTTLE_MS. One query, no Meta call.
 */
export async function dueForSync(brands: SyncTarget[]): Promise<SyncTarget[]> {
  const linked = brands.filter((b) => b.instagram_username);
  if (linked.length === 0) return [];
  const { data } = await supabaseAdmin()
    .from('marcas_ig_sync_log')
    .select('brand_id')
    .in('brand_id', linked.map((b) => b.id))
    .gte('at', new Date(Date.now() - THROTTLE_MS).toISOString());
  const fresh = new Set((data ?? []).map((r) => r.brand_id as string));
  return linked.filter((b) => !fresh.has(b.id));
}

/** Reads the given brands from Meta now (no throttle). */
export async function syncBrands(brands: SyncTarget[]): Promise<Record<string, SyncOutcome>> {
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
      try {
        await syncOne(brand.id, igUserId);
        out[brand.id] = 'ok';
      } catch (err) {
        console.error(`[marcas/instagram] sync ${brand.id} failed:`, err);
        out[brand.id] = 'error';
      }
    }),
  );
  return out;
}

/** Drops read-log rows older than LOG_KEEP_DAYS (the summary looks back a week). */
export async function pruneSyncLog(): Promise<void> {
  const cutoff = new Date(Date.now() - LOG_KEEP_DAYS * 86_400_000).toISOString();
  const { error } = await supabaseAdmin().from('marcas_ig_sync_log').delete().lt('at', cutoff);
  if (error) console.error('[marcas/instagram] prune failed:', error.message);
}
