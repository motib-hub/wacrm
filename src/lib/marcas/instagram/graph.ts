import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';

/**
 * Server-only, read-only access to the brands' Instagram accounts through
 * Meta's Graph API, as a business system user that each client's
 * portfolio shares its Page + Instagram with (partner access).
 *
 * The token is stored encrypted in `marcas_integrations` (id 'meta';
 * 059_motib_marcas_published_instagram) with the scheduled sync's secret.
 * It only carries read scopes: publishing never goes through the CRM.
 */

const GRAPH = 'https://graph.facebook.com/v23.0/';
const ACCOUNTS_TTL_MS = 3_600_000;

interface MetaCredentials {
  token: string;
  cronSecret?: string;
}

const CREDENTIALS_TTL_MS = 10 * 60_000;

// Re-read every few minutes, so a rotated token takes effect without a redeploy.
let credentials: { at: number; value: MetaCredentials } | null = null;
let accounts: { at: number; byUsername: Map<string, string> } | null = null;

/** null when Meta isn't set up yet: the summary just shows "not connected". */
async function loadCredentials(): Promise<MetaCredentials | null> {
  if (credentials && Date.now() - credentials.at < CREDENTIALS_TTL_MS) return credentials.value;
  const { data, error } = await supabaseAdmin()
    .from('marcas_integrations')
    .select('credentials')
    .eq('id', 'meta')
    .limit(1);
  if (error) throw new Error(`meta credentials: ${error.message}`);
  const encrypted = data?.[0]?.credentials;
  if (!encrypted) return null;
  const value = JSON.parse(decrypt(encrypted)) as MetaCredentials;
  credentials = { at: Date.now(), value };
  return value;
}

export async function metaConfigured(): Promise<boolean> {
  return (await loadCredentials()) !== null;
}

/** Constant-time check of the scheduled sync's bearer secret. */
export async function isCronSecret(given: string): Promise<boolean> {
  const expected = (await loadCredentials())?.cronSecret;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class MetaApiError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`meta api ${status}: ${detail}`);
  }
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const creds = await loadCredentials();
  if (!creds) throw new MetaApiError(0, 'not configured');
  // Token in a header, never in the URL: URLs end up in logs.
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${creds.token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    // Meta's error body never echoes the token, but keep it short anyway.
    const detail = await res.text().catch(() => '');
    throw new MetaApiError(res.status, detail.slice(0, 300));
  }
  return (await res.json()) as T;
}

interface Page<T> {
  data?: T[];
}

/** Instagram accounts the system user reaches, by lowercase username → IG user id. */
export async function instagramAccounts(): Promise<Map<string, string>> {
  if (accounts && Date.now() - accounts.at < ACCOUNTS_TTL_MS) return accounts.byUsername;
  const pages = await graphGet<Page<{ instagram_business_account?: { id: string; username?: string } }>>(
    'me/accounts',
    { fields: 'instagram_business_account{id,username}', limit: '100' },
  );
  const byUsername = new Map<string, string>();
  for (const page of pages.data ?? []) {
    const ig = page.instagram_business_account;
    if (ig?.username) byUsername.set(ig.username.toLowerCase(), ig.id);
  }
  accounts = { at: Date.now(), byUsername };
  return byUsername;
}

export interface IgMedia {
  id: string;
  media_type: string;
  timestamp: string;
  permalink?: string;
}

const MEDIA_FIELDS = 'id,media_type,timestamp,permalink';

/** The account's latest feed posts (newest first). */
export async function recentPosts(igUserId: string, limit = 30): Promise<IgMedia[]> {
  return (await graphGet<Page<IgMedia>>(`${igUserId}/media`, { fields: MEDIA_FIELDS, limit: String(limit) })).data ?? [];
}

/** Stories live right now (the API only shows the last 24 h). */
export async function liveStories(igUserId: string): Promise<IgMedia[]> {
  return (await graphGet<Page<IgMedia>>(`${igUserId}/stories`, { fields: MEDIA_FIELDS })).data ?? [];
}
