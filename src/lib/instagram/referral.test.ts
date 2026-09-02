import { describe, expect, it } from 'vitest'

import {
  buildContactAttribution,
  hasUsableAdReferral,
  parseUtmParams,
  type InstagramReferral,
} from './referral'

const AD_REFERRAL: InstagramReferral = {
  source: 'ADS',
  ad_id: '120210000000999888',
  refererUri: 'https://instagram.com/?utm_source=instagram&utm_medium=paid&utm_campaign=lanzamiento',
}

describe('hasUsableAdReferral', () => {
  it('accepts a referral whose source is ADS', () => {
    expect(hasUsableAdReferral(AD_REFERRAL)).toBe(true)
  })

  it.each(['SHORTLINK', 'LINK', 'BUSINESS_CARD', 'DISCOVER_TAB'])(
    'rejects organic source %s so it never qualifies as arrived_from_ad',
    (source) => {
      expect(hasUsableAdReferral({ source })).toBe(false)
    },
  )

  it('rejects a missing referral', () => {
    expect(hasUsableAdReferral(undefined)).toBe(false)
    expect(hasUsableAdReferral(null)).toBe(false)
  })
})

describe('parseUtmParams', () => {
  it('extracts utm parameters from the referer uri', () => {
    expect(parseUtmParams(AD_REFERRAL.refererUri)).toEqual({
      utm_source: 'instagram',
      utm_medium: 'paid',
      utm_campaign: 'lanzamiento',
    })
  })

  it('returns null for a url with no utm params', () => {
    expect(parseUtmParams('https://instagram.com/reel/abc')).toBeNull()
  })

  it('returns null for a missing url', () => {
    expect(parseUtmParams(undefined)).toBeNull()
    expect(parseUtmParams(null)).toBeNull()
  })

  it('does not throw on an unparseable url', () => {
    expect(parseUtmParams('not a url')).toBeNull()
  })
})

describe('buildContactAttribution', () => {
  it('reuses attribution_source_type "ad" — the same value the automations', () => {
    // engine's arrived_from_ad condition already checks in production
    // for WhatsApp, so an Instagram ad lead qualifies into the same
    // pipeline stage with zero changes to that engine code.
    const result = buildContactAttribution(AD_REFERRAL, '2026-09-02T10:00:00.000Z')
    expect(result.attribution_source_type).toBe('ad')
  })

  it('maps ad_id, the referer uri, and parsed utms', () => {
    const result = buildContactAttribution(AD_REFERRAL, '2026-09-02T10:00:00.000Z')
    expect(result).toEqual({
      attribution_source_type: 'ad',
      attribution_source_id: '120210000000999888',
      attribution_source_url: AD_REFERRAL.refererUri,
      attribution_headline: null,
      attribution_body: null,
      attribution_ctwa_clid: null,
      attribution_utm: {
        utm_source: 'instagram',
        utm_medium: 'paid',
        utm_campaign: 'lanzamiento',
      },
      attribution_at: '2026-09-02T10:00:00.000Z',
      attribution_raw: AD_REFERRAL,
    })
  })

  it('falls back to `ref` when refererUri is absent', () => {
    const referral: InstagramReferral = { source: 'ADS', ref: 'https://x.com/?utm_id=1' }
    const result = buildContactAttribution(referral, '2026-09-02T10:00:00.000Z')
    expect(result.attribution_source_url).toBe('https://x.com/?utm_id=1')
    expect(result.attribution_utm).toEqual({ utm_id: '1' })
  })

  it('handles a referral with no ad_id or url gracefully', () => {
    const result = buildContactAttribution({ source: 'ADS' }, '2026-09-02T10:00:00.000Z')
    expect(result.attribution_source_id).toBeNull()
    expect(result.attribution_source_url).toBeNull()
    expect(result.attribution_utm).toBeNull()
  })
})
