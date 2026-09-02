import { describe, expect, it } from 'vitest'

import {
  buildLeadAdsAttribution,
  extractLeadFields,
  formatLeadSummary,
  type LeadDetails,
  type LeadgenEvent,
} from './attribution'

const EVENT: LeadgenEvent = {
  leadgen_id: '999888777',
  page_id: '111222333',
  form_id: '444555666',
  ad_id: '777888999',
  campaign_id: '000111222',
  created_time: 1893456000, // 2029-12-31T08:00:00Z-ish, just a fixed epoch
}

const DETAILS: LeadDetails = {
  form_id: '444555666',
  ad_id: '777888999',
  ad_name: 'Campaña de lanzamiento — creativo A',
  campaign_id: '000111222',
  campaign_name: 'Lanzamiento primavera',
  field_data: [
    { name: 'full_name', values: ['Juana Pérez'] },
    { name: 'phone_number', values: ['+5491122334455'] },
    { name: 'email', values: ['juana@example.com'] },
    { name: 'presupuesto_estimado', values: ['5000-10000'] },
  ],
}

describe('extractLeadFields', () => {
  it('pulls name, phone and email by Meta reserved field names', () => {
    expect(extractLeadFields(DETAILS.field_data)).toEqual({
      name: 'Juana Pérez',
      phone: '+5491122334455',
      email: 'juana@example.com',
    })
  })

  it('is not confused by a renamed/reordered custom question', () => {
    const fieldData = [
      { name: 'presupuesto_estimado', values: ['5000-10000'] },
      { name: 'phone_number', values: ['+5491100001111'] },
    ]
    expect(extractLeadFields(fieldData)).toEqual({ name: null, phone: '+5491100001111', email: null })
  })

  it('returns all-null for undefined field_data', () => {
    expect(extractLeadFields(undefined)).toEqual({ name: null, phone: null, email: null })
  })

  it('skips a field with an empty values array', () => {
    expect(extractLeadFields([{ name: 'phone_number', values: [] }])).toEqual({
      name: null,
      phone: null,
      email: null,
    })
  })
})

describe('buildLeadAdsAttribution', () => {
  it('always writes attribution_source_type "ad" — Lead Ads has no organic form', () => {
    // Reuses the exact value the automations engine's arrived_from_ad
    // condition checks in production for WhatsApp CTWA leads, so a
    // Lead Ads lead qualifies into the same pipeline stage with zero
    // changes to that engine code.
    const result = buildLeadAdsAttribution(EVENT, DETAILS, '2026-09-02T10:00:00.000Z')
    expect(result.attribution_source_type).toBe('ad')
  })

  it('prefers the enriched ad_id/ad_name from the Graph API details call', () => {
    const result = buildLeadAdsAttribution(EVENT, DETAILS, '2026-09-02T10:00:00.000Z')
    expect(result.attribution_source_id).toBe('777888999')
    expect(result.attribution_headline).toBe('Campaña de lanzamiento — creativo A')
  })

  it('falls back to the webhook event ids when the Graph API enrichment failed', () => {
    const result = buildLeadAdsAttribution(EVENT, null, '2026-09-02T10:00:00.000Z')
    expect(result.attribution_source_id).toBe('777888999')
    expect(result.attribution_headline).toBeNull()
    expect(result.attribution_raw.leadgen_id).toBe('999888777')
  })

  it('falls back to adgroup_id when neither details nor event carry an ad_id', () => {
    const event: LeadgenEvent = { ...EVENT, ad_id: undefined, adgroup_id: 'ag123' }
    const result = buildLeadAdsAttribution(event, null, '2026-09-02T10:00:00.000Z')
    expect(result.attribution_source_id).toBe('ag123')
  })

  it('keeps the full field_data in attribution_raw for later reference', () => {
    const result = buildLeadAdsAttribution(EVENT, DETAILS, '2026-09-02T10:00:00.000Z')
    expect(result.attribution_raw.field_data).toEqual(DETAILS.field_data)
  })
})

describe('formatLeadSummary', () => {
  it('renders a readable synthetic message from the submitted fields', () => {
    const summary = formatLeadSummary(DETAILS.field_data, 'Formulario Lanzamiento')
    expect(summary).toContain('Formulario: Formulario Lanzamiento')
    expect(summary).toContain('full_name: Juana Pérez')
    expect(summary).toContain('phone_number: +5491122334455')
  })

  it('falls back to a generic header when the form has no name', () => {
    const summary = formatLeadSummary(DETAILS.field_data, null)
    expect(summary.split('\n')[0]).toBe('Nuevo lead de formulario')
  })

  it('skips fields with no answer', () => {
    const summary = formatLeadSummary([{ name: 'email', values: [] }], 'F')
    expect(summary).toBe('Formulario: F')
  })
})
