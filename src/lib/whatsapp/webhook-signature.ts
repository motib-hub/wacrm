import crypto from 'node:crypto'

/**
 * Verify the HMAC-SHA256 signature Meta attaches to webhook POSTs.
 *
 * Meta signs the raw request body with the App Secret of the app whose
 * subscription delivered the event, and sends the result in the
 * `x-hub-signature-256: sha256=<hex>` header. Without verification,
 * anyone who knows our webhook URL can POST fabricated status updates
 * and drift broadcast counts arbitrarily.
 *
 * Reference:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify-payloads
 *
 * Contract:
 *   `META_APP_SECRET` is **required**. If it's missing we fail closed —
 *   every request is rejected until the operator configures the
 *   secret. A previous version fell open with a warning log, which is
 *   unsafe for a public template: anyone who forgets the env var would
 *   be running a fully spoofable webhook.
 *
 *   It may hold **several** secrets separated by commas (issue #500).
 *   Each Meta App signs with its own secret, so one deployment that
 *   receives webhooks from WABAs living under different Meta Apps needs
 *   to accept any of them. A request is valid when its signature
 *   matches ANY configured secret; each candidate is compared in
 *   constant time. See docs/multi-waba.md.
 *
 *   Per-account secrets (migration 035, this fork): a client whose WABA
 *   lives in their own Business portfolio brings their own Meta app, and
 *   reaching it from ours needs a partner slot Meta caps and that is
 *   usually full. Callers pass that account's secret as an extra
 *   candidate; it is checked alongside every `META_APP_SECRET` entry, so
 *   the env var may even be unset for a deployment that only serves
 *   bring-your-own-app accounts.
 */

/**
 * Split `META_APP_SECRET` into its candidate secrets: comma-separated,
 * whitespace trimmed, empties dropped. Exported for tests and for
 * anything else that wants to know how many apps are configured.
 */
export function parseAppSecrets(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function signatureMatches(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  // Bail if lengths differ — timingSafeEqual throws otherwise.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  /** Candidate app secrets. Nullish entries are ignored, so callers can
   *  pass a possibly-absent per-account secret without filtering. */
  secrets?: (string | null | undefined)[],
): boolean {
  const candidates = [
    ...new Set([
      ...(secrets ?? []).filter((x): x is string => Boolean(x && x.trim())),
      ...parseAppSecrets(process.env.META_APP_SECRET),
    ]),
  ]
  if (candidates.length === 0) {
    console.error(
      '[webhook] no app secret available — rejecting request. Set ' +
        'META_APP_SECRET (Meta → App Settings → Basic → App Secret), or ' +
        'give this account its own app in Settings → WhatsApp.',
    )
    return false
  }

  if (!signatureHeader) return false
  if (!signatureHeader.startsWith('sha256=')) return false

  // Deliberately no early return inside the loop's compare: every
  // candidate is checked with timingSafeEqual, and the loop cost is
  // proportional to the number of configured apps (public knowledge
  // from the operator's point of view), not to the secret contents.
  let ok = false
  for (const secret of candidates) {
    if (signatureMatches(rawBody, signatureHeader, secret)) ok = true
  }
  return ok
}

export function verifyTokenMatches(stored: string, presented: string): boolean {
  const a = crypto.createHash('sha256').update(stored).digest()
  const b = crypto.createHash('sha256').update(presented).digest()
  return crypto.timingSafeEqual(a, b)
}
