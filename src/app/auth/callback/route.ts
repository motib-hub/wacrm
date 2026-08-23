import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Landing point for every link Supabase mails out — password recovery,
 * email confirmation, magic links. It turns the one-time token in the URL
 * into a real session cookie and then forwards to `next`.
 *
 * Without this route the recovery mail sent by /forgot-password pointed at
 * a 404, so "forgot my password" was unusable for everyone and the only way
 * back into an account was an admin editing auth.users by hand.
 *
 * Two token shapes arrive here and both have to work:
 *   - `code`       — PKCE. Only exchangeable in the browser profile that
 *                    started the flow, since the verifier lives there.
 *   - `token_hash` — what the default mail templates send. Works on any
 *                    device, which is the common case: someone requests the
 *                    reset on a laptop and opens the mail on their phone.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = safeNext(url.searchParams.get('next'))

  const supabase = await createClient()

  let message: string | null = null
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    message = error?.message ?? null
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    message = error?.message ?? null
  } else {
    message = 'invalid_link'
  }

  if (message) {
    // Back to sign-in rather than a dead end. Recovery links are single-use
    // and expire, so an already-clicked link landing here is routine, not
    // an anomaly worth a stack trace.
    const login = new URL('/login', url.origin)
    login.searchParams.set('error', message)
    return NextResponse.redirect(login)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}

/**
 * `next` comes straight off a query string, so it is attacker-controlled:
 * an absolute URL here would turn our own auth mail into an open redirect
 * to a lookalike login page. Only same-site absolute paths pass, and the
 * `//` check blocks `//evil.com`, which `new URL()` reads as a host.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}
