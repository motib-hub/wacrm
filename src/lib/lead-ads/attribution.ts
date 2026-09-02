/**
 * Attribution + contact fields for a Meta Lead Ads submission.
 *
 * Unlike WhatsApp and Instagram, a `leadgen` webhook event never
 * needs a "was this actually an ad" check — the Lead Ads product only
 * exists attached to a paid ad; there is no organic Lead Ads form.
 * That's why `buildLeadAdsAttribution` below always writes
 * `attribution_source_type: 'ad'` unconditionally, reusing the exact
 * value the automations engine's `arrived_from_ad` condition already
 * checks for WhatsApp (see migration 036's header comment for why
 * that reuse — not a new 'lead_form' value — is the point).
 */

/** The `leadgen` change value as Meta's webhook sends it. */
export interface LeadgenEvent {
  leadgen_id: string
  page_id: string
  form_id: string
  adgroup_id?: string
  ad_id?: string
  campaign_id?: string
  created_time?: number
}

/** One answer from the Graph API's `/{leadgen_id}` field_data array. */
export interface LeadFieldDatum {
  name: string
  values: string[]
}

/** The subset of `/{leadgen_id}` this integration reads. */
export interface LeadDetails {
  field_data?: LeadFieldDatum[]
  form_id?: string
  ad_id?: string
  ad_name?: string
  campaign_id?: string
  campaign_name?: string
}

export interface ContactAttribution {
  attribution_source_type: 'ad'
  attribution_source_id: string | null
  attribution_headline: string | null
  attribution_at: string
  attribution_raw: Record<string, unknown>
}

export interface ExtractedLeadFields {
  name: string | null
  phone: string | null
  email: string | null
}

/**
 * Meta's field names for the built-in "full_name" / "phone_number" /
 * "email" questions are lowercase and underscored, but a form builder
 * can rename or reorder custom questions, so match by the well-known
 * keys Meta reserves for these rather than by position.
 */
const NAME_KEYS = new Set(['full_name', 'first_name'])
const PHONE_KEYS = new Set(['phone_number'])
const EMAIL_KEYS = new Set(['email'])

export function extractLeadFields(
  fieldData: LeadFieldDatum[] | undefined,
): ExtractedLeadFields {
  const result: ExtractedLeadFields = { name: null, phone: null, email: null }
  for (const field of fieldData ?? []) {
    const value = field.values?.[0]
    if (!value) continue
    const key = field.name?.toLowerCase()
    if (!result.name && NAME_KEYS.has(key)) result.name = value
    if (!result.phone && PHONE_KEYS.has(key)) result.phone = value
    if (!result.email && EMAIL_KEYS.has(key)) result.email = value
  }
  return result
}

/**
 * Build the contact's first-touch attribution row for a Lead Ads
 * submission. `capturedAt` should be the lead's `created_time` when
 * Meta sent one — the moment the person submitted the form, not the
 * moment our webhook got round to processing it (same convention as
 * `attribution_at` everywhere else in this codebase).
 */
export function buildLeadAdsAttribution(
  event: LeadgenEvent,
  details: LeadDetails | null,
  capturedAt: string,
): ContactAttribution {
  const adId = details?.ad_id ?? event.ad_id ?? event.adgroup_id ?? null
  return {
    attribution_source_type: 'ad',
    attribution_source_id: adId,
    attribution_headline: details?.ad_name ?? null,
    attribution_at: capturedAt,
    attribution_raw: {
      leadgen_id: event.leadgen_id,
      form_id: event.form_id,
      page_id: event.page_id,
      ad_id: adId,
      campaign_id: details?.campaign_id ?? event.campaign_id ?? null,
      campaign_name: details?.campaign_name ?? null,
      field_data: details?.field_data ?? null,
    },
  }
}

/**
 * Render the submitted fields into a readable message body — the
 * synthetic "message" a lead-form conversation opens with, since a
 * form submission has no chat text of its own. Keeps the raw
 * field_data too (in attribution_raw), this is purely for the inbox
 * bubble.
 */
export function formatLeadSummary(
  fieldData: LeadFieldDatum[] | undefined,
  formName?: string | null,
): string {
  const lines: string[] = []
  lines.push(formName ? `Formulario: ${formName}` : 'Nuevo lead de formulario')
  for (const field of fieldData ?? []) {
    const value = field.values?.[0]
    if (!value) continue
    lines.push(`${field.name}: ${value}`)
  }
  return lines.join('\n')
}
