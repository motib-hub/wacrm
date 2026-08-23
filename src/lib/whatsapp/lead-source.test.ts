import { describe, expect, it } from 'vitest'
import {
  buildLeadSourceAttribution,
  extractClickIds,
  matchLeadSource,
  normalizeForMatch,
  type LeadSource,
} from './lead-source'

const source = (over: Partial<LeadSource> = {}): LeadSource => ({
  id: 'src-1',
  code: 'web-home',
  label: 'Botón de la web',
  match_text: 'vengo de la web',
  ...over,
})

describe('normalizeForMatch', () => {
  it('folds accents so a phone keyboard cannot break a match', () => {
    expect(normalizeForMatch('Vengo de la página')).toBe('vengo de la pagina')
  })

  it('collapses punctuation and repeated spaces', () => {
    expect(normalizeForMatch('Hola!!  vengo,  de la  web.')).toBe(
      'hola vengo de la web',
    )
  })

  it('survives emoji, which arrive in real prefills', () => {
    expect(normalizeForMatch('Hola 👋 vengo de la web')).toBe(
      'hola vengo de la web',
    )
  })
})

describe('matchLeadSource', () => {
  it('matches the sentence the link prefilled', () => {
    expect(matchLeadSource('Hola, vengo de la web', [source()])?.code).toBe(
      'web-home',
    )
  })

  it('still matches when the person types past the prefill', () => {
    const text = 'Hola, vengo de la web — necesito precios para 200 unidades'
    expect(matchLeadSource(text, [source()])?.code).toBe('web-home')
  })

  it('prefers the most specific source when two overlap', () => {
    const general = source({ id: 'a', code: 'web', match_text: 'vengo de la web' })
    const specific = source({
      id: 'b',
      code: 'web-precios',
      match_text: 'vengo de la web de precios',
    })
    const matched = matchLeadSource('Hola, vengo de la web de precios', [
      general,
      specific,
    ])
    expect(matched?.code).toBe('web-precios')
  })

  it('attributes nothing for an organic message', () => {
    expect(matchLeadSource('Hola, cuánto sale?', [source()])).toBeNull()
  })

  it('refuses to match on an empty match_text', () => {
    // A blank row would otherwise claim every message that ever arrives,
    // which is worse than attributing nothing.
    expect(matchLeadSource('cualquier cosa', [source({ match_text: '  ' })])).toBeNull()
  })

  it('handles a message that is only punctuation', () => {
    expect(matchLeadSource('???', [source()])).toBeNull()
  })
})

describe('extractClickIds', () => {
  it('pulls a gclid out of the prefilled text', () => {
    expect(extractClickIds('vengo de la web gclid=Cj0KCQiA_abc123')).toEqual({
      gclid: 'Cj0KCQiA_abc123',
    })
  })

  it('accepts the separators a hand-built link may use', () => {
    expect(extractClickIds('ref gclid: Cj0KCQiA_abc123')).toEqual({
      gclid: 'Cj0KCQiA_abc123',
    })
  })

  it('keeps the iOS-era variants, which are the hardest traffic to attribute', () => {
    expect(extractClickIds('hola wbraid=Ab_cdef12345')).toEqual({
      wbraid: 'Ab_cdef12345',
    })
  })

  it('returns null when there is nothing to report', () => {
    expect(extractClickIds('Hola, vengo de la web')).toBeNull()
  })
})

describe('buildLeadSourceAttribution', () => {
  it('writes into the same first-touch columns ads use', () => {
    const attribution = buildLeadSourceAttribution(
      source(),
      'Hola, vengo de la web',
      '2026-08-23T21:00:00.000Z',
    )
    expect(attribution.attribution_source_type).toBe('link')
    expect(attribution.attribution_source_id).toBe('web-home')
    expect(attribution.attribution_headline).toBe('Botón de la web')
    expect(attribution.attribution_at).toBe('2026-08-23T21:00:00.000Z')
  })

  it('keeps the sentence it matched on, so the claim is auditable', () => {
    const attribution = buildLeadSourceAttribution(
      source(),
      'Hola, vengo de la web',
      '2026-08-23T21:00:00.000Z',
    )
    expect(attribution.attribution_raw).toMatchObject({
      matched_source_id: 'src-1',
      message_text: 'Hola, vengo de la web',
    })
  })
})
