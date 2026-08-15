import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { requestSmbAppData } from '@/lib/whatsapp/meta-api'

/**
 * POST /api/whatsapp/config/sync
 *
 * Asks Meta to send us the existing data on a coexistence number: the
 * phone's address book and up to 180 days of past conversations.
 *
 * Both are requests, not fetches — Meta acknowledges immediately and
 * streams the data back over the `smb_app_state_sync` and `history`
 * webhook fields over the following minutes. A success here means the
 * request was accepted; the inbox fills in asynchronously.
 *
 * ─── Why this is a button and not automatic ───────────────────────
 * Meta only honours these requests for 24 hours after the business
 * completes coexistence pairing. A background job that retried on a
 * schedule would burn that window silently on any failure. Making it
 * an explicit action means the user sees the error while there's
 * still time to fix it and re-pair if needed.
 *
 * The two requests are independent: contacts can succeed while
 * history fails (or vice versa), so each is reported separately
 * rather than collapsed into one pass/fail.
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      )
    }

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!config) {
      return NextResponse.json(
        { error: 'No WhatsApp configuration saved yet.' },
        { status: 400 }
      )
    }

    if (!config.coexistence) {
      return NextResponse.json(
        {
          error:
            'This number was not connected through coexistence, so there is no WhatsApp Business app data to import.',
        },
        { status: 400 }
      )
    }

    // Callers pick which halves to run so a partial failure can be
    // retried without re-importing what already landed. Default: both.
    let want: { contacts: boolean; history: boolean } = {
      contacts: true,
      history: true,
    }
    try {
      const body = await request.json()
      if (body && typeof body === 'object') {
        want = {
          contacts: body.contacts !== false,
          history: body.history !== false,
        }
      }
    } catch {
      // No body — keep the both-halves default.
    }

    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch {
      return NextResponse.json(
        {
          error:
            'Stored access token could not be decrypted. Use Reset Configuration and save your credentials again.',
        },
        { status: 500 }
      )
    }

    const results: Record<string, { ok: boolean; error?: string }> = {}
    const update: Record<string, unknown> = {}
    const errors: string[] = []

    if (want.contacts) {
      try {
        await requestSmbAppData({
          phoneNumberId: config.phone_number_id,
          accessToken,
          syncType: 'smb_app_state_sync',
        })
        results.contacts = { ok: true }
        update.contacts_sync_requested_at = new Date().toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.contacts = { ok: false, error: message }
        errors.push(`contacts: ${message}`)
      }
    }

    if (want.history) {
      try {
        await requestSmbAppData({
          phoneNumberId: config.phone_number_id,
          accessToken,
          syncType: 'history',
        })
        results.history = { ok: true }
        update.history_sync_requested_at = new Date().toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.history = { ok: false, error: message }
        errors.push(`history: ${message}`)
      }
    }

    update.last_sync_error = errors.length ? errors.join(' | ') : null

    const { error: updateError } = await supabase
      .from('whatsapp_config')
      .update(update)
      .eq('account_id', accountId)

    if (updateError) {
      console.error('[whatsapp/sync] config update failed:', updateError.message)
    }

    return NextResponse.json({
      success: errors.length === 0,
      results,
      // Nothing is in the database yet — set expectations so the user
      // doesn't read an empty inbox as a failure and re-click.
      message:
        errors.length === 0
          ? 'Meta accepted the request. Contacts and past conversations will appear over the next few minutes.'
          : 'Some requests were rejected by Meta.',
    })
  } catch (error) {
    console.error('Error in WhatsApp sync POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
