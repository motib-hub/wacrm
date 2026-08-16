import { describe, expect, it } from 'vitest';

import {
  buildContactAttribution,
  hasUsableReferral,
  parseUtmParams,
  type WhatsAppReferral,
} from './referral';

const AD_REFERRAL: WhatsAppReferral = {
  source_url: 'https://motibhub.com.ar/?utm_source=facebook&utm_medium=cpc&utm_campaign=branding-agosto',
  source_id: '120210000000123456',
  source_type: 'ad',
  headline: 'Branding para empresas',
  body: 'Cotizá tu presupuesto',
  media_type: 'image',
  image_url: 'https://example.com/creative.jpg',
  ctwa_clid: 'ARBxyz123',
};

describe('parseUtmParams', () => {
  it('extracts every utm parameter from the source url', () => {
    expect(parseUtmParams(AD_REFERRAL.source_url)).toEqual({
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'branding-agosto',
    });
  });

  it('keeps utm keys the canonical five would miss', () => {
    // Ad platforms keep inventing these; a hardcoded list would drop
    // exactly the field someone built their reporting around.
    expect(
      parseUtmParams('https://x.com/?utm_id=99&utm_source_platform=meta'),
    ).toEqual({ utm_id: '99', utm_source_platform: 'meta' });
  });

  it('lowercases keys so UTM_Source and utm_source collapse', () => {
    expect(parseUtmParams('https://x.com/?UTM_Source=Google')).toEqual({
      utm_source: 'Google',
    });
  });

  it('ignores non-utm query parameters', () => {
    expect(parseUtmParams('https://x.com/?fbclid=abc&ref=nav')).toBeNull();
  });

  it('returns null rather than an empty object when there are none', () => {
    // NULL reads as "nothing to show"; {} would read as "we looked and
    // found an empty set", which renders as a stray empty block.
    expect(parseUtmParams('https://fb.me/2abcdef')).toBeNull();
  });

  it('survives a malformed url without throwing', () => {
    // A bad value here must not take the whole inbound message down.
    expect(parseUtmParams('not a url at all')).toBeNull();
    expect(parseUtmParams(undefined)).toBeNull();
    expect(parseUtmParams(null)).toBeNull();
  });

  it('drops utm keys with empty values', () => {
    expect(parseUtmParams('https://x.com/?utm_source=&utm_medium=cpc')).toEqual({
      utm_medium: 'cpc',
    });
  });
});

describe('hasUsableReferral', () => {
  it('accepts a referral carrying any identifying field', () => {
    expect(hasUsableReferral(AD_REFERRAL)).toBe(true);
    expect(hasUsableReferral({ ctwa_clid: 'only-this' })).toBe(true);
    expect(hasUsableReferral({ source_id: 'only-this' })).toBe(true);
  });

  it('rejects an empty object', () => {
    // Writing a row of nulls would mark the contact attributed and
    // block the real referral forever, since first touch never
    // overwrites.
    expect(hasUsableReferral({})).toBe(false);
  });

  it('rejects a referral with only decorative fields', () => {
    expect(hasUsableReferral({ headline: 'Hi', media_type: 'image' })).toBe(
      false,
    );
  });

  it('rejects null and undefined', () => {
    expect(hasUsableReferral(null)).toBe(false);
    expect(hasUsableReferral(undefined)).toBe(false);
  });
});

describe('buildContactAttribution', () => {
  const capturedAt = '2026-08-16T12:00:00.000Z';

  it('maps every referral field onto its column', () => {
    expect(buildContactAttribution(AD_REFERRAL, capturedAt)).toEqual({
      attribution_source_type: 'ad',
      attribution_source_id: '120210000000123456',
      attribution_source_url: AD_REFERRAL.source_url,
      attribution_headline: 'Branding para empresas',
      attribution_body: 'Cotizá tu presupuesto',
      attribution_ctwa_clid: 'ARBxyz123',
      attribution_utm: {
        utm_source: 'facebook',
        utm_medium: 'cpc',
        utm_campaign: 'branding-agosto',
      },
      attribution_at: capturedAt,
      attribution_raw: AD_REFERRAL,
    });
  });

  it('nulls the columns a sparse referral does not fill', () => {
    const sparse: WhatsAppReferral = { source_id: '123', source_type: 'ad' };
    const built = buildContactAttribution(sparse, capturedAt);

    expect(built.attribution_source_id).toBe('123');
    expect(built.attribution_headline).toBeNull();
    expect(built.attribution_body).toBeNull();
    expect(built.attribution_ctwa_clid).toBeNull();
    expect(built.attribution_utm).toBeNull();
  });

  it('keeps the raw object so unmodelled fields survive', () => {
    // Meta adds fields over time; the columns lag, the raw doesn't.
    const withUnknown = { ...AD_REFERRAL, some_new_field: 'value' };
    const built = buildContactAttribution(withUnknown, capturedAt);

    expect(built.attribution_raw).toMatchObject({ some_new_field: 'value' });
  });

  it('stamps the moment the lead arrived, not the moment we processed it', () => {
    // The caller passes the message timestamp — a report is about when
    // the lead came in, not when the webhook got round to it.
    const built = buildContactAttribution(AD_REFERRAL, '2026-01-01T00:00:00.000Z');
    expect(built.attribution_at).toBe('2026-01-01T00:00:00.000Z');
  });
});
