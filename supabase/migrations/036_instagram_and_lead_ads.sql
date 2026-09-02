-- ============================================================
-- 036_instagram_and_lead_ads.sql — Instagram Direct + Meta Lead Ads
--
-- Adds the two new inbound channels asked for alongside WhatsApp:
-- Instagram DMs and native Lead Ads ("More info" forms on IG/FB ads).
-- Both are built to land in the SAME `conversations` / `messages` /
-- `contacts` tables WhatsApp already uses, not a parallel schema —
-- that is what lets a single inbox and a single pipeline show all
-- three channels without the UI knowing which one produced a row.
--
-- ─── meta_page_config ─────────────────────────────────────────────
-- Mirrors `whatsapp_config`'s shape (encrypted token, per-account app
-- secret, verify token) but is keyed by Facebook Page rather than by
-- WhatsApp phone_number_id, because that is the unit Meta actually
-- uses for both products: Instagram Messaging webhooks arrive on the
-- IG-scoped user id (`ig_user_id`), Lead Ads webhooks arrive on the
-- Page id (`page_id`), and both are read with the SAME Page Access
-- Token. One config row per account covers both webhooks.
--
-- ─── conversations.channel ────────────────────────────────────────
-- The column that lets one inbox hold three channels. Defaults to
-- 'whatsapp' so every existing row (and every WhatsApp code path that
-- doesn't set it) is unaffected. 'lead_form' is its own channel value
-- rather than being folded into 'instagram' or 'whatsapp' — a lead
-- form submission is not a chat thread, and a report that asks "how
-- many leads came from the form vs from DMs" needs the distinction.
--
-- ─── contacts.phone / contacts.instagram_id ───────────────────────
-- `phone` was NOT NULL because every contact used to arrive over
-- WhatsApp. An Instagram DM sender has no phone number — Meta gives
-- only an IG-scoped id — so the constraint is loosened. This is
-- strictly a widening: every existing WhatsApp row already has a
-- phone and no existing query assumes NOT NULL (findExistingContact,
-- the phone dedupe index, etc. all already handle a possibly-absent
-- phone via COALESCE/optional chaining upstream). Nothing about how a
-- WhatsApp contact is created, matched, or displayed changes.
--
-- ─── Attribution reuses 'ad', not a new value ─────────────────────
-- migration 032 added contacts.attribution_source_type, and the
-- automations engine's `arrived_from_ad` condition (see
-- src/lib/automations/engine.ts) qualifies a lead into the pipeline
-- when that column reads exactly 'ad'. An Instagram DM opened from a
-- Click-to-Instagram ad, and every Lead Ads submission (that product
-- only exists attached to a paid ad — there is no organic Lead Ads
-- form), are both literally that same signal. Writing
-- attribution_source_type = 'ad' for them — instead of a new value
-- like 'instagram_ad' or 'lead_form' — means the existing, already-
-- live-with-real-clients `arrived_from_ad` automation condition picks
-- them up with ZERO changes to src/lib/automations/engine.ts. That
-- file is exactly the kind of code this task was told to leave alone
-- unless confirmed first, so the design routes around needing to
-- touch it at all. Which specific product produced the row is not
-- lost — it's still in attribution_raw (source/ad_id for Instagram,
-- the full leadgen payload for Lead Ads) and inferable from
-- conversations.channel.
--
-- Idempotent — safe to run more than once.
-- ============================================================

-- ---- meta_page_config ---------------------------------------------
CREATE TABLE IF NOT EXISTS meta_page_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Facebook Page id. Present for every connected page; this is the
  -- `entry.id` on a Lead Ads (object=page) webhook delivery.
  page_id TEXT NOT NULL,
  -- IG-scoped business account id, when the page has Instagram
  -- linked. This is the `entry.id` on an Instagram (object=instagram)
  -- webhook delivery. Nullable: a page can run Lead Ads with no
  -- linked Instagram account at all.
  ig_user_id TEXT,
  page_name TEXT,
  -- Page Access Token. AES-256-GCM encrypted with the same helper as
  -- whatsapp_config.access_token (src/lib/whatsapp/encryption.ts —
  -- generic despite living under lib/whatsapp, see that module's
  -- header comment). Used both to call the Graph API (fetch an IG
  -- profile, fetch full leadgen field_data) and, indirectly, is the
  -- credential these webhooks were granted against.
  access_token TEXT NOT NULL,
  -- Same per-account-app-secret pattern as migration 035: nullable,
  -- falls back to the operator-wide META_APP_SECRET env var when
  -- absent. Encrypted at rest — it's what proves a webhook payload
  -- really came from Meta.
  app_secret TEXT,
  app_id TEXT,
  -- Encrypted, matching whatsapp_config.verify_token. Checked against
  -- hub.verify_token on the GET verification handshake.
  verify_token TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One config per account, same invariant as whatsapp_config since
  -- 017 (whatsapp_config_account_id_key) — one connected Page per
  -- account, keeps "which config owns this event" unambiguous.
  UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_page_config_account ON meta_page_config(account_id);
-- Webhook lookup path: resolve the owning account from entry.id.
-- Partial + unique because ig_user_id is optional but must not be
-- claimed by two accounts when it is set.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_page_config_page_id ON meta_page_config(page_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_page_config_ig_user_id
  ON meta_page_config(ig_user_id) WHERE ig_user_id IS NOT NULL;

ALTER TABLE meta_page_config ENABLE ROW LEVEL SECURITY;
-- Settings-class RLS, identical shape to whatsapp_config (017):
-- any member can read, only an admin can write.
DROP POLICY IF EXISTS meta_page_config_select ON meta_page_config;
DROP POLICY IF EXISTS meta_page_config_insert ON meta_page_config;
DROP POLICY IF EXISTS meta_page_config_update ON meta_page_config;
DROP POLICY IF EXISTS meta_page_config_delete ON meta_page_config;
CREATE POLICY meta_page_config_select ON meta_page_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY meta_page_config_insert ON meta_page_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY meta_page_config_update ON meta_page_config FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY meta_page_config_delete ON meta_page_config FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- conversations.channel -----------------------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'instagram', 'lead_form'));

CREATE INDEX IF NOT EXISTS idx_conversations_account_channel
  ON conversations(account_id, channel);

-- ---- contacts: allow non-phone identities --------------------------
ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS instagram_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_instagram_id
  ON contacts(account_id, instagram_id) WHERE instagram_id IS NOT NULL;

-- A contact needs at least one way to be reached / re-identified.
-- Widening `phone` to nullable must not open the door to a fully
-- empty identity row.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_has_identity;
ALTER TABLE contacts ADD CONSTRAINT contacts_has_identity
  CHECK (phone IS NOT NULL OR instagram_id IS NOT NULL OR email IS NOT NULL);
