/**
 * Click-to-Instagram attribution.
 *
 * Meta attaches a `referral` object to the first message of an
 * Instagram Direct thread when it was opened from an ad. It has a
 * different shape than WhatsApp's Click-to-WhatsApp referral (see
 * `src/lib/whatsapp/referral.ts`) — no headline/body/image, just the
 * `source`, an optional `ad_id`, and the URI that opened the thread —
 * but it answers the same question: which ad produced this lead.
 *
 * Reference:
 *   https://developers.facebook.com/docs/messenger-platform/instagram/features/referral
 *
 * ─── It arrives once, same as WhatsApp ───────────────────────────
 * Only the first message of an ad-originated thread carries it.
 * Capture it before anything else in the handler can bail.
 *
 * ─── attribution_source_type stays 'ad', not 'instagram_ad' ─────
 * See the header comment on migration 036. The automations engine's
 * `arrived_from_ad` condition already qualifies a contact into the
 * pipeline when `attribution_source_type = 'ad'` — a value it has
 * checked in production since PR #12. Reusing that exact value here
 * (instead of a channel-specific one) means an Instagram ad lead
 * enters the same pipeline stage as a WhatsApp ad lead with no change
 * to that engine code. Which channel produced the row is still
 * recoverable from `conversations.channel` and `attribution_raw`.
 */

/** The `referral` object as Meta sends it on an Instagram DM. */
export interface InstagramReferral {
  /** 'ADS' for a Click-to-Instagram ad; Meta also sends 'SHORTLINK',
   *  'LINK', 'BUSINESS_CARD', 'DISCOVER_TAB', etc. for non-ad origins. */
  source?: string
  /** Present only when `source` is 'ADS'. */
  ad_id?: string
  /** The link that opened the thread — carries UTMs when it had them. */
  ref?: string
  refererUri?: string
  [key: string]: unknown
}

export interface ContactAttribution {
  attribution_source_type: string | null
  attribution_source_id: string | null
  attribution_source_url: string | null
  attribution_headline: string | null
  attribution_body: string | null
  attribution_ctwa_clid: string | null
  attribution_utm: Record<string, string> | null
  attribution_at: string
  attribution_raw: InstagramReferral
}

/**
 * Pull every `utm_*` parameter out of a URL. Same behavior as
 * `parseUtmParams` in whatsapp/referral.ts — kept as a local copy
 * rather than a shared import so this module has no dependency on
 * `src/lib/whatsapp`, matching the "own top-level lib per channel"
 * layout the rest of this feature follows.
 */
export function parseUtmParams(
  url: string | undefined | null,
): Record<string, string> | null {
  if (!url) return null
  let params: URLSearchParams
  try {
    params = new URL(url).searchParams
  } catch {
    return null
  }
  const utm: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase().startsWith('utm_') && value) {
      utm[key.toLowerCase()] = value
    }
  }
  return Object.keys(utm).length > 0 ? utm : null
}

/**
 * Only a `source: 'ADS'` referral is a paid click — 'SHORTLINK',
 * 'LINK', 'BUSINESS_CARD' and the rest are organic entry points that
 * happen to carry a referral object too, and must not be credited as
 * a paid ad (that would make `arrived_from_ad` fire for free traffic).
 */
export function hasUsableAdReferral(
  referral: InstagramReferral | undefined | null,
): referral is InstagramReferral {
  if (!referral || typeof referral !== 'object') return false
  return referral.source === 'ADS'
}

/**
 * Map an ad referral onto the contact's first-touch attribution
 * columns — the same columns migration 032 added for WhatsApp, so a
 * report reads one place regardless of channel.
 */
export function buildContactAttribution(
  referral: InstagramReferral,
  capturedAt: string,
): ContactAttribution {
  const sourceUrl = referral.refererUri ?? referral.ref ?? null
  return {
    attribution_source_type: 'ad',
    attribution_source_id: referral.ad_id ?? null,
    attribution_source_url: sourceUrl,
    attribution_headline: null,
    attribution_body: null,
    attribution_ctwa_clid: null,
    attribution_utm: parseUtmParams(sourceUrl),
    attribution_at: capturedAt,
    attribution_raw: referral,
  }
}
