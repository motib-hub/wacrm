/**
 * Graph API call the meta_page_config settings screen uses to prove a
 * Page Access Token is actually valid — and actually scoped to the
 * Page id the user typed — before we ever encrypt and store it.
 *
 * Mirrors `verifyPhoneNumber` in `src/lib/whatsapp/meta-api.ts`: same
 * "fetch public metadata, throw Meta's own error message on failure"
 * shape, just against a Page node instead of a phone number node.
 */

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export interface MetaPageInfo {
  id: string
  name?: string
}

interface MetaErrorResponse {
  error?: { message?: string; code?: number; type?: string }
}

export interface VerifyPageAccessArgs {
  pageId: string
  accessToken: string
}

/**
 * Confirm the token can read `name` on this Page id. A 200 here means
 * the token is live and does have access to this specific page — not
 * just any page the underlying user happens to manage.
 */
export async function verifyPageAccess(args: VerifyPageAccessArgs): Promise<MetaPageInfo> {
  const { pageId, accessToken } = args
  const url = `${META_API_BASE}/${pageId}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
  const response = await fetch(url)

  if (!response.ok) {
    let message = `Meta rejected the request (HTTP ${response.status})`
    try {
      const data = (await response.json()) as MetaErrorResponse
      if (data.error?.message) message = data.error.message
    } catch {
      // response body wasn't JSON — keep the fallback
    }
    throw new Error(message)
  }

  return (await response.json()) as MetaPageInfo
}
