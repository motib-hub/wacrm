import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { verifyPageAccess } from '@/lib/meta/graph-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

/**
 * Settings screen for `meta_page_config` — the row that powers both
 * the Instagram DM webhook (`/api/instagram/webhook`) and the Lead
 * Ads webhook (`/api/lead-ads/webhook`). Same shape as
 * `/api/whatsapp/config`: GET never 500s on a business-logic failure
 * so the UI can render a message, POST/PUT verifies with the Graph
 * API before encrypting and saving.
 *
 * Until this route existed, the one connected account (Motib) was
 * inserted by hand with a direct SQL statement — see migration 036's
 * header comment and CLAUDE.md. That row must keep reading correctly
 * through this GET; nothing here should assume every row was written
 * through this API.
 */

/** Same inline resolver as `/api/whatsapp/config` — see that file's comment. */
async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * GET /api/meta/config
 *
 * Used by the "Test API Connection" button and by the page on load to
 * check whether the saved config is healthy. Returns 200 in all
 * non-auth cases so the UI can render an appropriate message rather
 * than show a 500.
 *
 * Response shape:
 *   { connected: true,  page_info: {...} }
 *   { connected: false, reason: 'no_config',       message: '...' }
 *   { connected: false, reason: 'token_corrupted', message: '...', needs_reset: true }
 *   { connected: false, reason: 'meta_api_error',  message: '...' }
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_account',
          message: 'Your profile is not linked to an account.',
        },
        { status: 200 },
      )
    }

    const { data: config, error: configError } = await supabase
      .from('meta_page_config')
      .select('page_id, ig_user_id, page_name, access_token, app_id, status')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError) {
      console.error('Error fetching meta_page_config:', configError)
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 }
      )
    }

    if (!config) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_config',
          message: 'No Instagram / Lead Ads configuration saved yet. Fill in the form and click Save Configuration.',
        },
        { status: 200 }
      )
    }

    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch (err) {
      console.error('[meta/config GET] Token decryption failed:', err)
      return NextResponse.json(
        {
          connected: false,
          reason: 'token_corrupted',
          needs_reset: true,
          message:
            'The stored access token cannot be decrypted with the current ENCRYPTION_KEY. This usually means the key changed, or it differs between environments (local vs Hostinger vs Vercel). Click "Reset Configuration" below, then re-save.',
        },
        { status: 200 }
      )
    }

    try {
      const pageInfo = await verifyPageAccess({ pageId: config.page_id, accessToken })
      return NextResponse.json({
        connected: true,
        page_info: pageInfo,
        ig_user_id: config.ig_user_id,
        app_id: config.app_id,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[meta/config GET] Meta API verification failed:', message)
      return NextResponse.json(
        {
          connected: false,
          reason: 'meta_api_error',
          message: `Meta API rejected the credentials: ${message}`,
        },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error('Error in Meta config GET:', error)
    return NextResponse.json(
      { connected: false, reason: 'unknown', message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/meta/config
 *
 * Saves or updates the meta_page_config row for the caller's account.
 * Verifies the Page Access Token against the Graph API BEFORE saving,
 * same as WhatsApp does with verifyPhoneNumber.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const pageId: string | null = trimmedOrNull(body.page_id)
    const igUserId: string | null = trimmedOrNull(body.ig_user_id)
    const accessToken: string | null = trimmedOrNull(body.access_token)
    const verifyToken: string | null = trimmedOrNull(body.verify_token)
    const appId: string | null = trimmedOrNull(body.app_id)
    // Blank means "keep using the operator-wide META_APP_SECRET" — same
    // per-account-app-secret pattern as whatsapp_config (migration 035).
    const appSecret: string | null = trimmedOrNull(body.app_secret)

    if (!pageId || !accessToken) {
      return NextResponse.json(
        { error: 'page_id and access_token are required' },
        { status: 400 }
      )
    }

    // Reject if another account already claimed this page_id or
    // ig_user_id — idx_meta_page_config_page_id / _ig_user_id are
    // UNIQUE, so a collision here would otherwise surface as an opaque
    // 500 from the DB constraint instead of a clear message. Same
    // "check with the admin client, RLS hides other accounts' rows"
    // reasoning as /api/whatsapp/config.
    const orFilters = [`page_id.eq.${pageId}`]
    if (igUserId) orFilters.push(`ig_user_id.eq.${igUserId}`)
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('meta_page_config')
      .select('account_id, page_id, ig_user_id')
      .neq('account_id', accountId)
      .or(orFilters.join(','))
      .maybeSingle()

    if (claimedError) {
      console.error('Error checking page_id/ig_user_id ownership:', claimedError)
      return NextResponse.json(
        { error: 'Failed to validate configuration' },
        { status: 500 }
      )
    }

    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This Facebook Page (or its linked Instagram account) is already connected to another account on this instance.',
        },
        { status: 409 }
      )
    }

    // Verify credentials with Meta BEFORE saving.
    let pageInfo
    try {
      pageInfo = await verifyPageAccess({ pageId, accessToken })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Meta API verification failed during save:', message)
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 400 }
      )
    }

    let encryptedAccessToken: string
    let encryptedVerifyToken: string | null
    let encryptedAppSecret: string | null
    try {
      encryptedAccessToken = encrypt(accessToken)
      encryptedVerifyToken = verifyToken ? encrypt(verifyToken) : null
      encryptedAppSecret = appSecret ? encrypt(appSecret) : null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('Encryption failed:', message)
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string in your environment variables.',
        },
        { status: 500 }
      )
    }

    const { data: existing } = await supabase
      .from('meta_page_config')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle()

    const baseRow = {
      page_id: pageId,
      ig_user_id: igUserId,
      page_name: pageInfo.name ?? null,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      app_id: appId,
      app_secret: encryptedAppSecret,
      status: 'connected' as const,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('meta_page_config')
        .update(baseRow)
        .eq('account_id', accountId)

      if (updateError) {
        console.error('Error updating meta_page_config:', updateError)
        return NextResponse.json(
          { error: 'Failed to update configuration' },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await supabase
        .from('meta_page_config')
        .insert({
          account_id: accountId,
          user_id: user.id,
          ...baseRow,
        })

      if (insertError) {
        console.error('Error inserting meta_page_config:', insertError)
        return NextResponse.json(
          { error: 'Failed to save configuration' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      saved: true,
      page_info: pageInfo,
    })
  } catch (error) {
    console.error('Error in Meta config POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT behaves identically to POST — the form doesn't distinguish
// create vs update client-side (mirrors /api/whatsapp/config).
export { POST as PUT }

/**
 * DELETE /api/meta/config
 *
 * Removes the authenticated account's meta_page_config row. Used by
 * "Reset Configuration" to recover from a corrupted encrypted token.
 */
export async function DELETE() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const { error: deleteError } = await supabase
      .from('meta_page_config')
      .delete()
      .eq('account_id', accountId)

    if (deleteError) {
      console.error('Error deleting meta_page_config:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in Meta config DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Optional text field off a JSON body: a value, or null. An empty
 * string has to become null rather than be stored as-is — see
 * `/api/whatsapp/config`'s identical helper for why.
 */
function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
