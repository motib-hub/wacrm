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
 * ─── Why more than one secret ────────────────────────────────────
 * A client's WhatsApp Business Account lives in the client's own
 * Business portfolio, and reaching it from our app requires a partner
 * slot that Meta caps and that is usually already full. Letting each
 * account bring its own Meta app removes that dependency entirely, and
 * that means the webhook can no longer assume a single secret. Callers
 * pass the candidates: the account's own secret when it has one, plus
 * the operator-wide `META_APP_SECRET` from the environment.
 *
 * ─── Fails closed ────────────────────────────────────────────────
 * With no candidate secrets every request is rejected. A previous
 * version fell open with a warning log, which is unsafe for a public
 * template: anyone who forgot the env var would be running a fully
 * spoofable webhook.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  /** Candidate app secrets. Nullish entries are ignored, so callers can
   *  pass a possibly-absent per-account secret without filtering. */
  secrets?: (string | null | undefined)[],
): boolean {
  const candidates = (
    secrets && secrets.length > 0
      ? secrets
      : [process.env.META_APP_SECRET]
  ).filter((s): s is string => Boolean(s))

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

  // Every candidate is checked even after one matches, so the work done
  // does not depend on which secret was the right one — the same reason
  // the comparison itself is timing-safe.
  let matched = false
  for (const secret of candidates) {
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

    const a = Buffer.from(signatureHeader)
    const b = Buffer.from(expected)
    // Bail if lengths differ — timingSafeEqual throws otherwise.
    if (a.length !== b.length) continue
    if (crypto.timingSafeEqual(a, b)) matched = true
  }
  return matched
}
