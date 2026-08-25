-- ============================================================
-- 035_per_account_app_secret.sql — One Meta app per account
--
-- The webhook verifies Meta's signature with a single `META_APP_SECRET`
-- env var, so every connected number has to belong to the one Meta app
-- the operator owns. For a self-hosted CRM with one number that is
-- exactly right. For an agency it is a wall.
--
-- The wall: a client's WhatsApp Business Account lives in the client's
-- own Business portfolio — that is where it belongs, because the
-- conversation charges, the business verification and the number
-- itself are theirs. For our app to reach it, the client has to share
-- the WABA with our portfolio as a partner. Meta caps how many
-- partners a WABA may have, and that cap is routinely already full:
-- the chatbot they tried last year, the BSP that onboarded them, an
-- agency they no longer work with. Someone has to be evicted before a
-- new client can be connected at all.
--
-- With an app secret per account, none of that applies. The client
-- creates a Meta app inside their own portfolio, points it at the same
-- webhook URL, and their app reaches their own WABA with no partner
-- slot involved. Connecting a client stops depending on Meta's cap or
-- on removing whoever occupies it.
--
-- `app_secret` is encrypted at rest with the same AES-256-GCM helper as
-- `access_token`: it is the key that proves a webhook payload really
-- came from Meta, so a leak would let anyone forge inbound messages.
-- `app_id` is not secret — it is kept for the UI, so the settings page
-- can show which app a number is wired to.
--
-- Both nullable. An account with neither falls back to the env var,
-- which is what every existing install keeps doing.
--
-- Idempotent — safe to run more than once.
-- ============================================================

ALTER TABLE whatsapp_config
  -- AES-256-GCM encrypted, same format as access_token.
  ADD COLUMN IF NOT EXISTS app_secret TEXT,
  -- Public identifier; shown in Settings so a number can be traced to
  -- the app that feeds it.
  ADD COLUMN IF NOT EXISTS app_id TEXT;

COMMENT ON COLUMN whatsapp_config.app_secret IS
  'Encrypted Meta App Secret for this account''s own Meta app. NULL falls back to META_APP_SECRET.';
COMMENT ON COLUMN whatsapp_config.app_id IS
  'Meta App ID this number''s webhooks come from. Not secret; for display.';
