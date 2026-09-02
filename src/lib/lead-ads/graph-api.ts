/**
 * Graph API call to fetch the full lead detail.
 *
 * The `leadgen` webhook event carries only ids (leadgen_id, form_id,
 * ad_id...) — Meta does not reliably include `field_data` (what the
 * person actually typed) on the webhook payload itself, so a second
 * call to `/{leadgen_id}` is required to get the name/phone/email the
 * lead submitted. Same shape as `src/lib/instagram/graph-api.ts`.
 */

import type { LeadDetails } from './attribution'

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

/**
 * Fetch full lead detail with the Page Access Token. Returns null on
 * failure — the caller still has the ids from the webhook event
 * itself and can create a bare contact rather than dropping the lead
 * entirely just because the enrichment call failed.
 */
export async function fetchLeadDetails(
  leadgenId: string,
  accessToken: string,
): Promise<LeadDetails | null> {
  try {
    const url = `${META_API_BASE}/${leadgenId}?fields=field_data,form_id,ad_id,ad_name,campaign_id,campaign_name&access_token=${encodeURIComponent(accessToken)}`
    const response = await fetch(url)
    if (!response.ok) {
      console.error('[lead-ads] leadgen detail fetch failed:', response.status)
      return null
    }
    return (await response.json()) as LeadDetails
  } catch (error) {
    console.error('[lead-ads] leadgen detail fetch failed:', error)
    return null
  }
}
