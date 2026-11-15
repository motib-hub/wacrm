import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';

/**
 * Server-only Google access for Marcas, as the read-only service account
 * stored (encrypted) in `marcas_integrations` (059_motib_marcas_integrations).
 *
 * Scopes are read-only on purpose: the board previews the team's Drive,
 * it never writes to it. Tokens are minted with a self-signed JWT — no
 * Google SDK dependency for two GET endpoints — and cached per instance
 * until a minute before they expire.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let account: ServiceAccount | null = null;
let token: { value: string; expiresAt: number } | null = null;

async function loadAccount(): Promise<ServiceAccount> {
  if (account) return account;
  const { data, error } = await supabaseAdmin()
    .from('marcas_integrations')
    .select('credentials')
    .eq('id', 'google')
    .limit(1);
  if (error) throw new Error(`google credentials: ${error.message}`);
  const encrypted = data?.[0]?.credentials;
  if (!encrypted) throw new Error('google credentials: not configured');
  account = JSON.parse(decrypt(encrypted)) as ServiceAccount;
  return account;
}

const b64url = (value: string) => Buffer.from(value).toString('base64url');

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const sa = await loadAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }),
  )}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`google token: ${body.error ?? res.status}`);
  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** GET a Google API URL as the service account; throws on non-2xx. */
export async function googleGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GoogleApiError(res.status, detail.slice(0, 300));
  }
  return (await res.json()) as T;
}

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`google api ${status}: ${detail}`);
  }
}
