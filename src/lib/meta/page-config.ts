/**
 * Shared `meta_page_config` lookups for the Instagram and Lead Ads
 * webhooks (migration 036).
 *
 * One config row per account covers both products because Meta does:
 * a Page's Access Token is what both the Instagram Messaging API and
 * the Lead Ads Graph API calls are made with. Split into its own
 * module (rather than duplicated in each route, the way WhatsApp's
 * `resolveConfigByPhoneNumberId` lives inline in its route) because
 * two different routes need the exact same two lookups.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MetaPageConfigRow = any

/**
 * Resolve the config row that owns a Facebook Page id. Used by the
 * Lead Ads webhook, whose `entry.id` is always the Page id.
 *
 * Mirrors the WhatsApp webhook's `resolveConfigByPhoneNumberId`:
 * 0 or 2+ matches both drop the event (with a log) rather than guess.
 */
export async function resolveConfigByPageId(
  db: SupabaseClient,
  pageId: string | undefined,
): Promise<MetaPageConfigRow | null> {
  if (!pageId) {
    console.error('[meta-webhook] event carried no page id — dropped')
    return null
  }
  return resolveOne(db, 'page_id', pageId)
}

/**
 * Resolve the config row that owns an IG-scoped business account id.
 * Used by the Instagram webhook, whose `entry.id` is the IG user id.
 */
export async function resolveConfigByIgUserId(
  db: SupabaseClient,
  igUserId: string | undefined,
): Promise<MetaPageConfigRow | null> {
  if (!igUserId) {
    console.error('[meta-webhook] event carried no ig_user_id — dropped')
    return null
  }
  return resolveOne(db, 'ig_user_id', igUserId)
}

async function resolveOne(
  db: SupabaseClient,
  column: 'page_id' | 'ig_user_id',
  value: string,
): Promise<MetaPageConfigRow | null> {
  const { data: rows, error } = await db
    .from('meta_page_config')
    .select('*')
    .eq(column, value)

  if (error) {
    console.error(`[meta-webhook] error fetching meta_page_config by ${column}:`, error)
    return null
  }
  if (!rows || rows.length === 0) {
    console.error(`[meta-webhook] no config found for ${column}:`, value)
    return null
  }
  if (rows.length > 1) {
    console.error(
      `[meta-webhook] multiple configs (${rows.length}) found for ${column}:`,
      value,
      '— event dropped. Resolve duplicates so each page maps to a single account.',
    )
    return null
  }
  return rows[0]
}

/**
 * The app secret to verify a payload's signature against, when the
 * account brought its own Meta app. Same "read the still-unverified
 * body just to pick a key" shape as the WhatsApp webhook's
 * `lookupAppSecret` — see that function's comment for why this is
 * safe: a forged id only selects a different real secret, which the
 * forger still can't produce a valid HMAC for.
 */
export async function lookupAppSecretByPageOrIgId(
  db: SupabaseClient,
  id: string | null,
): Promise<string | null> {
  if (!id) return null
  try {
    // Two `.eq()` calls, not a single `.or('page_id.eq.${id},...')`.
    // `id` is read from the still-unverified body (see the doc comment
    // above), so it must never be interpolated into a raw PostgREST
    // filter string — a comma or operator in it could reshape the
    // filter's structure, not just its value. `.eq()` binds `id` as a
    // parameter instead, the same way WhatsApp's `lookupAppSecret` does.
    const [byPage, byIg] = await Promise.all([
      db.from('meta_page_config').select('app_secret').eq('page_id', id),
      db.from('meta_page_config').select('app_secret').eq('ig_user_id', id),
    ])
    const stored = byPage.data?.[0]?.app_secret ?? byIg.data?.[0]?.app_secret
    if (!stored) return null
    return decrypt(stored)
  } catch (err) {
    console.error('[meta-webhook] app secret lookup failed:', err)
    return null
  }
}
