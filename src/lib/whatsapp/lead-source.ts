/**
 * Attribution for leads that do NOT come from a Click-to-WhatsApp ad.
 *
 * Meta tells us where an ad click came from (see `referral.ts`). For
 * every other channel — the button on the website, a QR in the shop,
 * the link in an Instagram bio, an email signature — WhatsApp hands
 * over a phone number and a message and nothing else. UTMs die at the
 * jump from the browser into the app.
 *
 * What survives is the prefilled text: `wa.me/<number>?text=...` opens
 * the chat with a sentence already typed, and that sentence arrives as
 * the first inbound message. Give each placement its own sentence and
 * the origin travels with the lead.
 *
 * ─── This evidence is softer than Meta's ─────────────────────────
 * The person can edit or delete the prefill before sending. Most do
 * not, but a share of them will, so counts from this path are a floor,
 * not a census — and a real `referral` always outranks it.
 */

/** A row of `lead_sources`, as the matcher needs it. */
export interface LeadSource {
  id: string
  code: string
  label: string
  match_text: string
}

export interface LeadSourceAttribution {
  attribution_source_type: 'link'
  attribution_source_id: string
  attribution_headline: string
  attribution_utm: Record<string, string> | null
  attribution_at: string
  attribution_raw: Record<string, unknown>
}

/**
 * Fold a message down to something two humans typing the same sentence
 * would both produce.
 *
 * Accents go because people write "vengo de la web" on a phone keyboard
 * that may or may not accent; punctuation and repeated spaces go
 * because WhatsApp, the browser and the person all disagree about
 * them. What is left is words and single spaces.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    // Strip combining accents — 'á' and 'a' must compare equal.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Find which registered source a first message came through.
 *
 * Substring rather than equality: people type ahead of the prefill
 * ("Hola, vengo de la web — necesito precios"), or trim its tail, and
 * either way they came through that link.
 *
 * When several sources match, the longest `match_text` wins. Overlap is
 * the normal case for a specific placement nested inside a general one
 * — "vengo de la web" and "vengo de la web de precios" — and the longer
 * sentence is the more specific claim.
 */
export function matchLeadSource(
  messageText: string | null | undefined,
  sources: LeadSource[],
): LeadSource | null {
  if (!messageText) return null
  const haystack = normalizeForMatch(messageText)
  if (!haystack) return null

  let best: LeadSource | null = null
  let bestLength = 0
  for (const source of sources) {
    const needle = normalizeForMatch(source.match_text ?? '')
    // An empty match_text would match every message ever sent; a row
    // that degenerate must attribute nothing rather than everything.
    if (!needle) continue
    if (!haystack.includes(needle)) continue
    if (needle.length > bestLength) {
      best = source
      bestLength = needle.length
    }
  }
  return best
}

/**
 * Google's click ids, when a link carried one into the prefill.
 *
 * Google Ads can only credit an offline sale if the click id comes
 * back with it. A visitor arriving from Google lands on the site with
 * `?gclid=...` in the URL; the site's WhatsApp button can copy that
 * into the prefilled text, and this pulls it back out on arrival.
 *
 * `gbraid` / `wbraid` are the iOS-era variants Google sends when
 * `gclid` is unavailable — omitting them would silently lose exactly
 * the traffic that is hardest to attribute.
 */
export function extractClickIds(
  messageText: string | null | undefined,
): Record<string, string> | null {
  if (!messageText) return null
  const found: Record<string, string> = {}
  // Accepts `gclid=abc`, `gclid:abc` and `gclid abc` — the separator
  // depends on whoever built the link, and all three are readable.
  const pattern = /\b(gclid|gbraid|wbraid)\s*[=:]?\s*([A-Za-z0-9_-]{8,})/gi
  for (const m of messageText.matchAll(pattern)) {
    found[m[1].toLowerCase()] = m[2]
  }
  return Object.keys(found).length > 0 ? found : null
}

/**
 * Map a matched source onto the contact's first-touch columns — the
 * same ones migration 032 created for ads, so a report reads one
 * place regardless of how the lead arrived.
 *
 * `capturedAt` is the message timestamp, not the clock: a report is
 * about when the lead arrived, not when our webhook got to it.
 */
export function buildLeadSourceAttribution(
  source: LeadSource,
  messageText: string,
  capturedAt: string,
): LeadSourceAttribution {
  return {
    attribution_source_type: 'link',
    attribution_source_id: source.code,
    attribution_headline: source.label,
    attribution_utm: extractClickIds(messageText),
    attribution_at: capturedAt,
    // Keep what we matched on. When someone later asks why a contact
    // is tagged with a channel, the answer is the sentence they sent.
    attribution_raw: {
      matched_source_id: source.id,
      matched_text: source.match_text,
      message_text: messageText,
    },
  }
}
