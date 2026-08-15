-- ============================================================
-- whatsapp_config: WhatsApp Coexistence support
--
-- Coexistence lets a business keep using the WhatsApp Business app
-- on their phone while the SAME number is also live on the Cloud
-- API. The business owner scans a QR from the app; no new SIM, no
-- number migration, no re-registration.
--
-- It changes three things for us:
--
--   1. `/register` must NOT be called. Meta registers the number as
--      part of the coexistence onboarding itself, and calling
--      /register with a 2FA PIN afterwards breaks the pairing (the
--      app-side session is torn down). The config route reads this
--      flag to skip step 1 entirely — distinct from the existing
--      "no PIN supplied" skip, which is a best-effort fallback.
--
--   2. Three extra webhook fields carry data that only exists in
--      coexistence mode:
--        smb_message_echoes  — replies the owner types on their PHONE,
--                              which must appear in the CRM inbox or
--                              agents talk over each other
--        smb_app_state_sync  — the phone's address book
--        history             — up to 180 days of past conversations
--
--   3. Contacts and history are PULLED, not pushed: we ask for them
--      once via the SMB App Data API and Meta streams them back over
--      the webhook in chunks. Meta gives a 24-hour window from
--      onboarding to make both requests; miss it and the business
--      has to offboard and start over. The timestamps below record
--      whether we've asked, so the UI can show a "sync now" action
--      while the window is still open and stop offering it after.
--
-- Backfill: every column is nullable or defaulted. Existing rows are
-- non-coexistence (FALSE) which is exactly the behaviour they have
-- today.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS coexistence BOOLEAN NOT NULL DEFAULT FALSE,
  -- When we successfully asked Meta for the phone's address book.
  ADD COLUMN IF NOT EXISTS contacts_sync_requested_at TIMESTAMPTZ,
  -- When we successfully asked Meta for past conversations.
  ADD COLUMN IF NOT EXISTS history_sync_requested_at TIMESTAMPTZ,
  -- When Meta reported the history stream reached 100% (progress
  -- arrives on every chunk; we stamp this on the last one).
  ADD COLUMN IF NOT EXISTS history_synced_at TIMESTAMPTZ,
  -- Last error from either SMB App Data request, surfaced in the UI
  -- so the user knows why the inbox came up empty.
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

-- The echo/history handlers dedupe by (conversation_id, message_id)
-- before every insert, because Meta redelivers webhooks on any
-- non-2xx and history chunks can legitimately overlap.
--
-- This index makes that lookup an index scan instead of a filter on
-- the per-conversation partition. It is deliberately NOT UNIQUE:
-- pre-existing duplicates from earlier Meta retries would make the
-- migration fail on live data, and dropping user-visible messages to
-- satisfy an index is not a trade this migration gets to make.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_message_id
  ON messages (conversation_id, message_id)
  WHERE message_id IS NOT NULL;
