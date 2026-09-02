/**
 * Graph API calls the Instagram webhook needs beyond what arrives in
 * the payload itself.
 *
 * The messaging webhook gives us the sender's IG-scoped id (`sender.id`)
 * but never a display name — unlike WhatsApp, which carries
 * `contacts[].profile.name` on every delivery. Without a name lookup
 * every Instagram contact would show up in the inbox as a raw numeric
 * id, which is why this call exists.
 */

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export interface InstagramProfile {
  name?: string
  username?: string
}

/**
 * Best-effort profile fetch. Returns null on any failure — a missing
 * name must not block contact creation or drop the inbound message;
 * the caller falls back to a placeholder built from the sender id.
 */
export async function fetchInstagramProfile(
  senderId: string,
  accessToken: string,
): Promise<InstagramProfile | null> {
  try {
    const url = `${META_API_BASE}/${senderId}?fields=name,username&access_token=${encodeURIComponent(accessToken)}`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = (await response.json()) as InstagramProfile
    return data
  } catch (error) {
    console.error('[instagram] profile fetch failed:', error)
    return null
  }
}
