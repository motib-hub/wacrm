import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature'
import { isUniqueViolation } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'
import { alreadyStoredMessage } from '@/lib/meta/dedupe'
import {
  resolveConfigByIgUserId,
  lookupAppSecretByPageOrIgId,
  type MetaPageConfigRow,
} from '@/lib/meta/page-config'
import { fetchInstagramProfile } from '@/lib/instagram/graph-api'
import { parseInstagramMessage, type InstagramMessage } from '@/lib/instagram/message-content'
import {
  buildContactAttribution,
  hasUsableAdReferral,
  type InstagramReferral,
} from '@/lib/instagram/referral'

// Same headroom rationale as the WhatsApp webhook — a profile fetch
// plus a few DB round trips comfortably fit inside 60s.
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

interface InstagramMessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: InstagramMessage
  /** Present only on the first message of an ad-originated thread. */
  referral?: InstagramReferral
}

interface InstagramWebhookEntry {
  id: string
  time: number
  messaging?: InstagramMessagingEvent[]
}

interface InstagramWebhookBody {
  object?: string
  entry?: InstagramWebhookEntry[]
}

// GET — webhook verification. Same shape as the WhatsApp route: check
// the challenge against every connected account's verify_token rather
// than a single env var, since each account can bring its own app.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const challenge = searchParams.get('hub.challenge')
    const verifyToken = searchParams.get('hub.verify_token')

    if (mode !== 'subscribe' || !challenge || !verifyToken) {
      return NextResponse.json({ error: 'Missing verification parameters' }, { status: 400 })
    }

    const { data: configs, error: configError } = await supabaseAdmin()
      .from('meta_page_config')
      .select('id, verify_token')

    if (configError || !configs) {
      console.error('[instagram webhook] error fetching configs for verification:', configError)
      return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matchedConfig: any = null
    for (const config of configs) {
      if (!config.verify_token) continue
      try {
        if (decrypt(config.verify_token) === verifyToken) {
          matchedConfig = config
          break
        }
      } catch {
        continue
      }
    }

    if (matchedConfig) {
      if (isLegacyFormat(matchedConfig.verify_token)) {
        void supabaseAdmin()
          .from('meta_page_config')
          .update({ verify_token: encrypt(verifyToken) })
          .eq('id', matchedConfig.id)
      }
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    return NextResponse.json({ error: 'Verification token mismatch' }, { status: 403 })
  } catch (error) {
    console.error('[instagram webhook] error in GET verification:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — receive Instagram Direct messages.
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  let body: InstagramWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Same "parse before verify is safe" reasoning as the WhatsApp
  // webhook: the parsed body is only used to pick which secret to
  // check the signature against, and a forged id just selects a
  // different real secret the forger still can't produce a valid
  // HMAC for. Nothing is trusted or written before the signature
  // check below passes.
  const igUserId = body?.entry?.[0]?.id ?? null
  const accountSecret = await lookupAppSecretByPageOrIgId(supabaseAdmin(), igUserId)

  if (!verifyMetaWebhookSignature(rawBody, signature, [accountSecret, process.env.META_APP_SECRET])) {
    console.warn('[instagram webhook] rejected request with invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (body.object !== 'instagram') {
    // Not our product — 200 so Meta doesn't retry, nothing to do.
    return NextResponse.json({ status: 'ignored' }, { status: 200 })
  }

  after(async () => {
    try {
      await processWebhook(body)
    } catch (error) {
      console.error('[instagram webhook] error processing webhook:', error)
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processWebhook(body: InstagramWebhookBody) {
  for (const entry of body.entry ?? []) {
    const config = await resolveConfigByIgUserId(supabaseAdmin(), entry.id)
    if (!config) continue

    for (const event of entry.messaging ?? []) {
      // Echoes of our own outbound sends arrive here too (is_echo on
      // the message object) — Instagram's Send API already returns
      // the message id synchronously, so unlike WhatsApp coexistence
      // there is nothing new to learn from an echo, and importing it
      // would double up every agent-sent message. Skip them.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((event.message as any)?.is_echo) continue
      if (!event.message) continue // delivery/read receipts, no message to store
      await processMessage(event, config)
    }
  }
}

async function processMessage(event: InstagramMessagingEvent, config: MetaPageConfigRow) {
  const message = event.message!
  const senderId = event.sender.id
  const accountId = config.account_id
  const configOwnerUserId = config.user_id
  const accessToken = decrypt(config.access_token)

  const contactOutcome = await findOrCreateContact(accountId, configOwnerUserId, senderId, accessToken)
  if (!contactOutcome) return
  const contactRecord = contactOutcome.contact

  // Capture ad attribution before anything else can bail — same
  // "arrives once" reasoning as the WhatsApp webhook.
  await captureAttribution(contactRecord, event)

  const convResult = await findOrCreateConversation(accountId, configOwnerUserId, contactRecord.id)
  if (!convResult) return
  const conversation = convResult.conversation

  if (convResult.created) {
    await dispatchWebhookEvent(supabaseAdmin(), accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contactRecord.id,
    })
  }

  if (await alreadyStoredMessage(supabaseAdmin(), conversation.id, message.mid)) return

  const { contentType, contentText, mediaUrl } = parseInstagramMessage(message)

  const { count: priorCustomerMsgCount } = await supabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0

  const { error: msgError } = await supabaseAdmin().from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: message.mid,
    status: 'delivered',
    created_at: new Date(event.timestamp).toISOString(),
  })
  if (msgError) {
    console.error('[instagram webhook] error inserting message:', msgError)
    return
  }

  const { error: convError } = await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText || `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
  if (convError) {
    console.error('[instagram webhook] error updating conversation:', convError)
  }

  // Same trigger set as the WhatsApp webhook's live inbound path.
  // Flows and AI auto-reply are deliberately NOT dispatched here —
  // both are built around WhatsApp-specific send paths
  // (send-message.ts targets the Cloud API) and wiring them for
  // Instagram is out of scope for this integration. See CLAUDE.md.
  const automationTriggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  )[] = ['new_message_received', 'keyword_match']
  if (contactOutcome.wasCreated) automationTriggers.unshift('new_contact_created')
  if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message')
  for (const triggerType of automationTriggers) {
    await runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contactRecord.id,
      context: { message_text: contentText ?? '', conversation_id: conversation.id },
    }).catch((err) => console.error('[instagram webhook] automations dispatch failed:', err))
  }

  await dispatchWebhookEvent(supabaseAdmin(), accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contactRecord.id,
    whatsapp_message_id: message.mid,
    content_type: contentType,
    text: contentText,
  })
}

interface ContactOutcome {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact: any
  wasCreated: boolean
}

async function findOrCreateContact(
  accountId: string,
  configOwnerUserId: string,
  igSenderId: string,
  accessToken: string,
): Promise<ContactOutcome | null> {
  const { data: existing, error: findError } = await supabaseAdmin()
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('instagram_id', igSenderId)
    .maybeSingle()

  if (findError) {
    console.error('[instagram webhook] error finding contact:', findError)
    return null
  }
  if (existing) return { contact: existing, wasCreated: false }

  // Best-effort profile lookup — a failure here must not drop the
  // inbound message, just leave the contact named after their id.
  const profile = await fetchInstagramProfile(igSenderId, accessToken)
  const name = profile?.name || profile?.username || `Instagram ${igSenderId}`

  const { data: created, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      instagram_id: igSenderId,
      name,
    })
    .select()
    .single()

  if (createError) {
    if (isUniqueViolation(createError)) {
      const { data: raced } = await supabaseAdmin()
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .eq('instagram_id', igSenderId)
        .maybeSingle()
      if (raced) return { contact: raced, wasCreated: false }
    }
    console.error('[instagram webhook] error creating contact:', createError)
    return null
  }

  return { contact: created, wasCreated: true }
}

async function captureAttribution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact: any,
  event: InstagramMessagingEvent,
): Promise<void> {
  if (!hasUsableAdReferral(event.referral)) return
  if (contact.attribution_at) return

  const capturedAt = new Date(event.timestamp).toISOString()
  const { error } = await supabaseAdmin()
    .from('contacts')
    .update(buildContactAttribution(event.referral!, capturedAt))
    .eq('id', contact.id)
    .is('attribution_at', null)

  if (error) {
    console.error('[instagram webhook] attribution capture failed:', error.message)
    return
  }
  console.info('[instagram webhook] attributed contact', contact.id, 'to ad', event.referral?.ad_id ?? '(no ad_id)')
}

async function findOrCreateConversation(accountId: string, configOwnerUserId: string, contactId: string) {
  const { data: existing, error: findError } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (findError) {
    console.error('[instagram webhook] error finding conversation:', findError)
    return null
  }
  if (existing && existing.length > 0) return { conversation: existing[0], created: false }

  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({ account_id: accountId, user_id: configOwnerUserId, contact_id: contactId, channel: 'instagram' })
    .select()
    .single()

  if (createError) {
    if (isUniqueViolation(createError)) {
      const { data: raced } = await supabaseAdmin()
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (raced && raced.length > 0) return { conversation: raced[0], created: false }
    }
    console.error('[instagram webhook] error creating conversation:', createError)
    return null
  }

  return { conversation: newConv, created: true }
}
