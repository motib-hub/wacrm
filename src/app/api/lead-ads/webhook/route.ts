import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'
import { alreadyStoredMessage } from '@/lib/meta/dedupe'
import { resolveConfigByPageId, lookupAppSecretByPageOrIgId, type MetaPageConfigRow } from '@/lib/meta/page-config'
import { fetchLeadDetails } from '@/lib/lead-ads/graph-api'
import {
  buildLeadAdsAttribution,
  extractLeadFields,
  formatLeadSummary,
  type LeadgenEvent,
} from '@/lib/lead-ads/attribution'

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

interface LeadgenWebhookChange {
  field: string
  value: LeadgenEvent
}

interface LeadAdsWebhookEntry {
  id: string
  time: number
  changes?: LeadgenWebhookChange[]
}

interface LeadAdsWebhookBody {
  object?: string
  entry?: LeadAdsWebhookEntry[]
}

// GET — webhook verification, identical shape to the Instagram route
// (both key off `meta_page_config`).
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
      console.error('[lead-ads webhook] error fetching configs for verification:', configError)
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
    console.error('[lead-ads webhook] error in GET verification:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — receive `leadgen` events.
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  let body: LeadAdsWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const pageId = body?.entry?.[0]?.id ?? null
  const accountSecret = await lookupAppSecretByPageOrIgId(supabaseAdmin(), pageId)

  if (!verifyMetaWebhookSignature(rawBody, signature, [accountSecret, process.env.META_APP_SECRET])) {
    console.warn('[lead-ads webhook] rejected request with invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (body.object !== 'page') {
    return NextResponse.json({ status: 'ignored' }, { status: 200 })
  }

  after(async () => {
    try {
      await processWebhook(body)
    } catch (error) {
      console.error('[lead-ads webhook] error processing webhook:', error)
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processWebhook(body: LeadAdsWebhookBody) {
  for (const entry of body.entry ?? []) {
    const config = await resolveConfigByPageId(supabaseAdmin(), entry.id)
    if (!config) continue

    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue
      await processLead(change.value, config)
    }
  }
}

async function processLead(event: LeadgenEvent, config: MetaPageConfigRow) {
  const accountId = config.account_id
  const configOwnerUserId = config.user_id
  const accessToken = decrypt(config.access_token)

  // The webhook event alone never carries what the person typed —
  // only ids. Enrich with the full field_data; a failed fetch still
  // lets the lead through (see fetchLeadDetails), just with a bare
  // summary and no name/phone/email.
  const details = await fetchLeadDetails(event.leadgen_id, accessToken)
  const fields = extractLeadFields(details?.field_data)

  const contactOutcome = await findOrCreateContact(accountId, configOwnerUserId, fields)
  if (!contactOutcome) return
  const contactRecord = contactOutcome.contact

  // First touch wins, same rule as every other channel. A Lead Ads
  // submission IS the ad click — there's no separate referral step —
  // so this always writes when the contact isn't already attributed.
  await captureAttribution(contactRecord, event, details)

  const convResult = await findOrCreateConversation(accountId, configOwnerUserId, contactRecord.id)
  if (!convResult) return
  const conversation = convResult.conversation

  if (convResult.created) {
    await dispatchWebhookEvent(supabaseAdmin(), accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contactRecord.id,
    })
  }

  // Idempotency key is the leadgen_id itself — Meta can redeliver
  // this webhook, and re-processing must not create a second
  // synthetic message (or, worse, a second contact/conversation pair
  // if the dedupe ran after those were already created on a prior
  // attempt — hence checking this AFTER find-or-create, which is
  // itself idempotent).
  if (await alreadyStoredMessage(supabaseAdmin(), conversation.id, event.leadgen_id)) return

  const summary = formatLeadSummary(details?.field_data, details?.form_id ?? event.form_id)
  const createdAt = event.created_time
    ? new Date(event.created_time * 1000).toISOString()
    : new Date().toISOString()

  const { count: priorCustomerMsgCount } = await supabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0

  const { error: msgError } = await supabaseAdmin().from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: 'text',
    content_text: summary,
    media_url: null,
    message_id: event.leadgen_id,
    status: 'delivered',
    created_at: createdAt,
  })
  if (msgError) {
    console.error('[lead-ads webhook] error inserting message:', msgError)
    return
  }

  const { error: convError } = await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: summary,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
  if (convError) {
    console.error('[lead-ads webhook] error updating conversation:', convError)
  }

  // Only the relationship-level triggers fire here — a form
  // submission is not a chat message, so `new_message_received` /
  // `keyword_match` (which exist to catch what a customer TYPED)
  // would be a category error. This mirrors the WhatsApp webhook's
  // own split between "who is this" triggers and "what did they say"
  // triggers — see its processMessage for the same distinction.
  const automationTriggers: ('new_contact_created' | 'first_inbound_message')[] = []
  if (contactOutcome.wasCreated) automationTriggers.push('new_contact_created')
  if (isFirstInboundMessage) automationTriggers.push('first_inbound_message')
  for (const triggerType of automationTriggers) {
    await runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contactRecord.id,
      context: { message_text: summary, conversation_id: conversation.id },
    }).catch((err) => console.error('[lead-ads webhook] automations dispatch failed:', err))
  }

  await dispatchWebhookEvent(supabaseAdmin(), accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contactRecord.id,
    whatsapp_message_id: event.leadgen_id,
    content_type: 'text',
    text: summary,
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
  fields: { name: string | null; phone: string | null; email: string | null },
): Promise<ContactOutcome | null> {
  // Prefer phone: it reuses the exact dedupe helper every other
  // channel uses, so a lead who already texted the WhatsApp number
  // once resolves to the SAME contact instead of a duplicate. Most
  // Lead Ads forms collect a phone number by default.
  if (fields.phone) {
    const existing = await findExistingContact(supabaseAdmin(), accountId, fields.phone)
    if (existing) {
      if (fields.name && fields.name !== existing.name) {
        await supabaseAdmin()
          .from('contacts')
          .update({ name: fields.name, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
      return { contact: existing, wasCreated: false }
    }
  } else if (fields.email) {
    // Fallback for forms that only collect email. Exact match only —
    // there is no fuzzy-email equivalent of phonesMatch, and a wrong
    // merge here (two different people, coincidentally similar
    // emails) is worse than an occasional duplicate contact.
    const { data: existing } = await supabaseAdmin()
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .eq('email', fields.email)
      .maybeSingle()
    if (existing) return { contact: existing, wasCreated: false }
  }

  const { data: created, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone: fields.phone,
      email: fields.email,
      name: fields.name || fields.phone || fields.email || 'Lead sin nombre',
    })
    .select()
    .single()

  if (createError) {
    if (isUniqueViolation(createError) && fields.phone) {
      const raced = await findExistingContact(supabaseAdmin(), accountId, fields.phone)
      if (raced) return { contact: raced, wasCreated: false }
    }
    console.error('[lead-ads webhook] error creating contact:', createError)
    return null
  }

  return { contact: created, wasCreated: true }
}

async function captureAttribution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact: any,
  event: LeadgenEvent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: any,
): Promise<void> {
  if (contact.attribution_at) return

  const capturedAt = event.created_time
    ? new Date(event.created_time * 1000).toISOString()
    : new Date().toISOString()

  const { error } = await supabaseAdmin()
    .from('contacts')
    .update(buildLeadAdsAttribution(event, details, capturedAt))
    .eq('id', contact.id)
    .is('attribution_at', null)

  if (error) {
    console.error('[lead-ads webhook] attribution capture failed:', error.message)
    return
  }
  console.info('[lead-ads webhook] attributed contact', contact.id, 'to lead form', event.form_id)
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
    console.error('[lead-ads webhook] error finding conversation:', findError)
    return null
  }
  if (existing && existing.length > 0) return { conversation: existing[0], created: false }

  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({ account_id: accountId, user_id: configOwnerUserId, contact_id: contactId, channel: 'lead_form' })
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
    console.error('[lead-ads webhook] error creating conversation:', createError)
    return null
  }

  return { conversation: newConv, created: true }
}
