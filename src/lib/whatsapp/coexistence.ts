/**
 * WhatsApp Coexistence — handlers for the three webhook fields that
 * only exist when a number runs the Business app and the Cloud API
 * at the same time.
 *
 *   smb_message_echoes  — the owner replied from their PHONE. Without
 *                         this the CRM shows a thread that looks
 *                         unanswered while the customer already got
 *                         an answer, and two agents talk over each
 *                         other. This is the field that makes
 *                         coexistence worth having.
 *   smb_app_state_sync  — the phone's address book, streamed after we
 *                         request it via the SMB App Data API.
 *   history             — up to 180 days of past conversations, also
 *                         pull-then-stream, delivered in 3 phases of
 *                         ordered chunks.
 *
 * ─── Direction ────────────────────────────────────────────────────
 * None of these payloads carry a direction flag. `from` is compared
 * against the business's own display phone number: equal means the
 * business sent it (sender_type 'agent'), anything else is the
 * customer. Both sides are normalised first — Meta writes the display
 * number without a '+' in metadata but message `from`/`to` are bare
 * digits too, and a stray format difference here would silently file
 * every outbound message as if the customer had sent it.
 *
 * ─── What these handlers deliberately do NOT do ───────────────────
 * They never dispatch flows, automations, or AI auto-replies. A
 * history import replays six months of customer messages; running the
 * live inbound pipeline over them would fire the AI responder at every
 * contact who ever wrote in — a mass-message incident, from a button
 * labelled "import my chats". Echoes are outbound and have no business
 * triggering inbound automations either.
 *
 * ─── Idempotency ──────────────────────────────────────────────────
 * Meta redelivers any webhook we don't 2xx, and history chunks can
 * overlap. Every insert is guarded by a (conversation_id, message_id)
 * lookup — migration 031 adds the supporting index. `messages.message_id`
 * is not globally unique (009: Meta ids repeat across numbers), so the
 * conversation scope is load-bearing, not decoration.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { toMessageContentType } from './content-type'
import { normalizePhone } from './phone-utils'

export const COEXISTENCE_WEBHOOK_FIELDS = new Set([
  'smb_message_echoes',
  'smb_app_state_sync',
  'history',
])

export function isCoexistenceWebhookField(field: string): boolean {
  return COEXISTENCE_WEBHOOK_FIELDS.has(field)
}

// ============================================================
// Payload shapes (Meta webhook reference)
// ============================================================

/** A message object as it appears in an echo or a history thread. */
export interface CoexistenceMessage {
  from: string
  /** Present on echoes and on business-sent history messages. */
  to?: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id?: string; caption?: string }
  video?: { id?: string; caption?: string }
  document?: { id?: string; filename?: string; caption?: string }
  audio?: { id?: string }
  sticker?: { id?: string }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
  /** History only — the state the message was in when it was archived. */
  history_context?: { status?: string }
}

export interface MessageEchoesValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  message_echoes?: CoexistenceMessage[]
}

export interface AppStateSyncValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  state_sync?: Array<{
    type?: string
    action?: string
    contact?: { full_name?: string; first_name?: string; phone_number?: string }
    metadata?: { timestamp?: string }
  }>
}

export interface HistoryValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  history?: Array<{
    metadata?: { phase?: number; chunk_order?: number; progress?: number }
    threads?: Array<{ id?: string; messages?: CoexistenceMessage[] }>
  }>
}

// ============================================================
// Dependencies
//
// Contact / conversation find-or-create lives in the webhook route
// (it owns the dedupe helper, the account tenancy split and the
// audit-user convention). Rather than move that machinery — and risk
// the live inbound path — the route injects it here. Keeps this
// module free of the lazily-initialised admin client and testable
// with plain fakes.
// ============================================================

export interface CoexistenceThread {
  conversationId: string
  contactId: string
}

export interface CoexistenceDeps {
  supabase: SupabaseClient
  /** Tenancy — every row written here belongs to this account. */
  accountId: string
  /** The business's own number, from value.metadata.display_phone_number. */
  businessPhone: string
  /** Find-or-create the contact AND its conversation. */
  resolveThread(
    phone: string,
    name?: string | null,
  ): Promise<CoexistenceThread | null>
  /** Find-or-create just the contact — address-book entries have no thread yet. */
  resolveContact(phone: string, name?: string | null): Promise<string | null>
  /** Persist sync progress against the whatsapp_config row. */
  markHistorySynced(): Promise<void>
}

/**
 * Meta's archived-message states (history_context.status) mapped onto
 * the messages.status CHECK constraint. PLAYED is a voice-note read
 * receipt, so it collapses to 'read'.
 */
const HISTORY_STATUS: Record<string, string> = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  PLAYED: 'read',
  ERROR: 'failed',
  PENDING: 'sending',
}

/**
 * Human-readable stand-in for a message whose body isn't text.
 *
 * Media is intentionally NOT downloaded on these paths. Meta only
 * exposes history media ids for 14 days after onboarding, and a
 * 180-day import can carry thousands of attachments — fetching them
 * inline would blow the webhook's execution budget and drop the
 * remaining chunks. The bubble shows the caption when there is one,
 * or a type marker, and the conversation stays readable.
 */
function describe(message: CoexistenceMessage): string | null {
  if (message.type === 'text') return message.text?.body ?? null
  const caption =
    message.image?.caption ?? message.video?.caption ?? message.document?.caption
  if (caption) return caption
  if (message.type === 'document' && message.document?.filename) {
    return `[${message.document.filename}]`
  }
  if (message.type === 'location') {
    const name = message.location?.name ?? message.location?.address
    return name ? `[location: ${name}]` : '[location]'
  }
  return `[${message.type}]`
}

/** True when this message was sent by the business, not the customer. */
function isFromBusiness(
  message: CoexistenceMessage,
  businessPhone: string,
): boolean {
  return normalizePhone(message.from) === normalizePhone(businessPhone)
}

/**
 * The customer's number for a message, whichever side sent it.
 * Returns null when the payload is too malformed to place in a thread.
 */
function counterpartyPhone(
  message: CoexistenceMessage,
  businessPhone: string,
): string | null {
  const other = isFromBusiness(message, businessPhone) ? message.to : message.from
  if (!other) return null
  const normalized = normalizePhone(other)
  return normalized || null
}

/** Has this exact Meta message id already landed in this thread? */
async function alreadyStored(
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
    // Fail closed: a failed dedupe check must not become a duplicate
    // bubble in the customer's thread.
    console.error('[coexistence] dedupe lookup failed:', error.message)
    return true
  }
  return (data?.length ?? 0) > 0
}

// ============================================================
// Dispatch
// ============================================================

export async function handleCoexistenceChange(
  change: { field: string; value: unknown },
  deps: CoexistenceDeps,
): Promise<void> {
  switch (change.field) {
    case 'smb_message_echoes':
      await handleMessageEchoes(change.value as MessageEchoesValue, deps)
      return
    case 'smb_app_state_sync':
      await handleAppStateSync(change.value as AppStateSyncValue, deps)
      return
    case 'history':
      await handleHistory(change.value as HistoryValue, deps)
      return
    default:
      // Pre-filtered by isCoexistenceWebhookField; defensive no-op in
      // case Meta adds a fourth coexistence field later.
      return
  }
}

// ============================================================
// smb_message_echoes — the owner answered from their phone
// ============================================================

export async function handleMessageEchoes(
  value: MessageEchoesValue,
  deps: CoexistenceDeps,
): Promise<void> {
  const echoes = value.message_echoes ?? []
  for (const echo of echoes) {
    const customerPhone = counterpartyPhone(echo, deps.businessPhone)
    if (!customerPhone) {
      console.warn('[coexistence] echo without a resolvable counterparty:', echo.id)
      continue
    }

    const thread = await deps.resolveThread(customerPhone)
    if (!thread) continue

    if (await alreadyStored(deps.supabase, thread.conversationId, echo.id)) continue

    const contentText = describe(echo)
    const createdAt = new Date(parseInt(echo.timestamp) * 1000).toISOString()

    const { error } = await deps.supabase.from('messages').insert({
      conversation_id: thread.conversationId,
      // 'agent', not 'bot' — a human typed this on a phone. sender_id
      // stays null: the Business app doesn't tell us which teammate it
      // was, and inventing an attribution would be worse than none.
      sender_type: 'agent',
      content_type: toMessageContentType(echo.type),
      content_text: contentText,
      media_url: null,
      message_id: echo.id,
      // The echo IS Meta's confirmation the message left the device.
      // Delivery/read receipts for it arrive on the normal `statuses`
      // webhook and advance the row from here.
      status: 'sent',
      created_at: createdAt,
    })

    if (error) {
      console.error('[coexistence] echo insert failed:', error.message)
      continue
    }

    // The owner just handled this thread on their phone, so it is no
    // longer waiting on the team — clear the unread badge rather than
    // leaving the inbox nagging about a conversation already answered.
    const { error: convError } = await deps.supabase
      .from('conversations')
      .update({
        last_message_text: contentText ?? `[${echo.type}]`,
        last_message_at: createdAt,
        unread_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', thread.conversationId)

    if (convError) {
      console.error('[coexistence] conversation update failed:', convError.message)
    }
  }
}

// ============================================================
// smb_app_state_sync — the phone's address book
// ============================================================

export async function handleAppStateSync(
  value: AppStateSyncValue,
  deps: CoexistenceDeps,
): Promise<void> {
  const entries = value.state_sync ?? []
  for (const entry of entries) {
    if (entry.type !== 'contact') continue

    // 'remove' means the owner deleted the entry from their phone's
    // address book. We do not mirror that: the CRM contact may carry
    // deals, notes and tags that have nothing to do with the phone,
    // and a webhook is not an instruction to destroy business records.
    // Removals are logged so an operator can act on them by hand.
    if (entry.action === 'remove') {
      console.info(
        '[coexistence] contact removed on device, kept in CRM:',
        entry.contact?.phone_number,
      )
      continue
    }

    const phone = entry.contact?.phone_number
    if (!phone) continue

    const name = entry.contact?.full_name ?? entry.contact?.first_name ?? null
    await deps.resolveContact(normalizePhone(phone), name)
  }
}

// ============================================================
// history — up to 180 days of past conversations
// ============================================================

export async function handleHistory(
  value: HistoryValue,
  deps: CoexistenceDeps,
): Promise<void> {
  const chunks = value.history ?? []

  for (const chunk of chunks) {
    for (const thread of chunk.threads ?? []) {
      const threadPhone = thread.id ? normalizePhone(thread.id) : null
      const messages = thread.messages ?? []
      if (!messages.length) continue

      // thread.id is the customer's number for the whole thread, so
      // resolve once instead of per message.
      const resolved = threadPhone
        ? await deps.resolveThread(threadPhone)
        : null
      if (!resolved) continue

      // Track the newest imported message so the inbox orders this
      // thread by real recency instead of import time.
      let newestIso: string | null = null
      let newestText: string | null = null

      for (const message of messages) {
        if (await alreadyStored(deps.supabase, resolved.conversationId, message.id)) {
          continue
        }

        const fromBusiness = isFromBusiness(message, deps.businessPhone)
        const contentText = describe(message)
        const createdAt = new Date(parseInt(message.timestamp) * 1000).toISOString()
        const archivedStatus = message.history_context?.status
        const status =
          (archivedStatus && HISTORY_STATUS[archivedStatus.toUpperCase()]) ??
          (fromBusiness ? 'sent' : 'delivered')

        const { error } = await deps.supabase.from('messages').insert({
          conversation_id: resolved.conversationId,
          sender_type: fromBusiness ? 'agent' : 'customer',
          content_type: toMessageContentType(message.type),
          content_text: contentText,
          media_url: null,
          message_id: message.id,
          status,
          created_at: createdAt,
        })

        if (error) {
          console.error('[coexistence] history insert failed:', error.message)
          continue
        }

        if (!newestIso || createdAt > newestIso) {
          newestIso = createdAt
          newestText = contentText
        }
      }

      if (newestIso) {
        // Only move the preview forward. A history chunk can arrive
        // after the thread already has live traffic, and an import
        // must never rewrite the inbox preview with an older message.
        const { data: current } = await deps.supabase
          .from('conversations')
          .select('last_message_at')
          .eq('id', resolved.conversationId)
          .maybeSingle()

        const currentIso = current?.last_message_at ?? null
        if (!currentIso || newestIso > currentIso) {
          const { error: convError } = await deps.supabase
            .from('conversations')
            .update({
              last_message_text: newestText,
              last_message_at: newestIso,
              updated_at: new Date().toISOString(),
            })
            .eq('id', resolved.conversationId)
          if (convError) {
            console.error(
              '[coexistence] history conversation update failed:',
              convError.message,
            )
          }
        }
      }
    }

    // Meta streams progress 0→100 across the chunks of all three
    // phases. Stamp completion on the chunk that reports 100 so the
    // UI can stop showing "importing…".
    if ((chunk.metadata?.progress ?? 0) >= 100) {
      await deps.markHistorySynced()
    }
  }
}
