/**
 * Idempotency guard shared by the Instagram and Lead Ads webhooks.
 *
 * Both routes ack Meta with 200 immediately and do the real work in
 * `after()` (same reasoning as the WhatsApp webhook — see that
 * route's comment on `after()` for why a detached promise is unsafe
 * on Vercel). That means a slow `after()` callback can still cause
 * Meta to retry the delivery before it sees our 200, and Lead Ads
 * webhooks are explicitly documented by Meta as at-least-once. Same
 * pattern as `coexistence.ts`'s `alreadyStored`: check before insert,
 * fail closed (treat a failed check as "already stored") so a lookup
 * error can never produce a duplicate bubble in the customer's thread.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function alreadyStoredMessage(
  supabase: SupabaseClient,
  conversationId: string,
  metaMessageId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('message_id', metaMessageId)
    .limit(1)
  if (error) {
    console.error('[meta-webhook] dedupe lookup failed:', error.message)
    return true
  }
  return (data?.length ?? 0) > 0
}
