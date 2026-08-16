/**
 * Click-to-WhatsApp attribution.
 *
 * Meta attaches a `referral` object to the inbound message when the
 * conversation was opened from an ad or an ad-derived link. It names
 * the ad, the creative the person actually saw, the URL that carried
 * them here, and `ctwa_clid` — the click id the Conversions API needs
 * to report a sale back against that click.
 *
 * ─── It arrives once ─────────────────────────────────────────────
 * Meta sends `referral` on the FIRST message of an ad-originated
 * conversation and not on the ones that follow. Miss it there and the
 * lead's origin is gone for good — which is why the webhook captures
 * it before anything else can fail.
 *
 * ─── First touch wins ────────────────────────────────────────────
 * `buildContactAttribution` produces the columns for a contact's
 * first-touch record. The caller writes them only when the contact
 * has none yet: "which ad brought this lead" means the ad that
 * produced them, not the latest one they happened to click. Per
 * message referrals stay on `messages.referral`, so last-touch is
 * still derivable if it's ever wanted.
 *
 * ─── Absence is ambiguous ────────────────────────────────────────
 * Meta omits the object entirely when attribution is switched off on
 * the WhatsApp Business Account. A contact with no attribution may
 * have arrived organically, or the setting may simply be off. Nothing
 * here can tell those apart.
 */

/** The `referral` object as Meta sends it. Every field is optional. */
export interface WhatsAppReferral {
  /** The link that opened the chat — carries UTMs when it had them. */
  source_url?: string
  /** Ad id or post id. The join key for per-ad reporting. */
  source_id?: string
  /** 'ad' | 'post' — Meta may add more, so it stays a string. */
  source_type?: string
  /** Headline of the creative the person saw. */
  headline?: string
  /** Body copy of the creative. */
  body?: string
  media_type?: string
  image_url?: string
  video_url?: string
  thumbnail_url?: string
  /** Meta's click id, required by the Conversions API. */
  ctwa_clid?: string
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
  attribution_raw: WhatsAppReferral
}

/**
 * Pull every `utm_*` parameter out of a URL.
 *
 * Deliberately generic rather than a fixed list of the canonical five:
 * ad platforms keep inventing parameters (`utm_id`, `utm_source_platform`),
 * and dropping one silently would lose exactly the field someone built
 * their reporting around.
 *
 * Returns null for an unparseable URL or one with no utm parameters, so
 * the column stays NULL instead of holding an empty object that reads
 * as "we looked and found nothing" in the UI.
 */
export function parseUtmParams(
  url: string | undefined | null,
): Record<string, string> | null {
  if (!url) return null

  let params: URLSearchParams
  try {
    params = new URL(url).searchParams
  } catch {
    // Meta sends things like `https://fb.me/<id>` that parse fine, but
    // a malformed value must not take the whole inbound message down.
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
 * True when the referral object carries anything worth storing.
 *
 * Meta has been observed sending an empty or near-empty object; writing
 * a row of nulls would mark the contact as "attributed" and block the
 * real referral from ever landing, since first-touch never overwrites.
 */
export function hasUsableReferral(
  referral: WhatsAppReferral | undefined | null,
): referral is WhatsAppReferral {
  if (!referral || typeof referral !== 'object') return false
  return Boolean(
    referral.source_id ||
      referral.source_url ||
      referral.ctwa_clid ||
      referral.source_type,
  )
}

/**
 * Map a referral onto the contact's first-touch attribution columns.
 *
 * `capturedAt` is passed in rather than read from the clock so the
 * caller can stamp it with the message timestamp — the moment the lead
 * actually arrived, which is what a report is about, not the moment
 * our webhook got round to processing it.
 */
export function buildContactAttribution(
  referral: WhatsAppReferral,
  capturedAt: string,
): ContactAttribution {
  return {
    attribution_source_type: referral.source_type ?? null,
    attribution_source_id: referral.source_id ?? null,
    attribution_source_url: referral.source_url ?? null,
    attribution_headline: referral.headline ?? null,
    attribution_body: referral.body ?? null,
    attribution_ctwa_clid: referral.ctwa_clid ?? null,
    attribution_utm: parseUtmParams(referral.source_url),
    attribution_at: capturedAt,
    attribution_raw: referral,
  }
}
