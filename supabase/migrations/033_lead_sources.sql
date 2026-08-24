-- ============================================================
-- 033_lead_sources.sql — Where a lead came from, when Meta won't say
--
-- Migration 032 records the origin of leads that arrive through a
-- Click-to-WhatsApp ad: Meta attaches a `referral` object and we keep
-- it. That covers ads and nothing else.
--
-- Every other channel arrives anonymous. Someone taps the WhatsApp
-- button on the website, scans a QR in the shop, follows the link in
-- an Instagram bio or an email signature — WhatsApp hands us a phone
-- number and a message, with no trace of where they were a second
-- earlier. UTMs do not survive the jump out of the browser and into
-- the app.
--
-- The one thing that does survive is the prefilled text. A link of the
-- form
--
--     https://wa.me/34674066429?text=Hola,%20vengo%20de%20la%20web
--
-- opens the chat with that sentence already typed, and it arrives as
-- the first inbound message. So the sentence IS the channel: give each
-- placement its own, and the origin rides in with the message.
--
-- This table is the registry of those sentences.
--
-- Design notes
--   - `match_text` is what we look for inside the first message —
--     compared accent- and case-insensitively, and as a substring, so
--     a person who types ahead of the prefill or trims the ending is
--     still attributed.
--   - `code` is the stable key for reporting ("leads por canal");
--     `label` is what a human reads in the contact's card. Renaming
--     the label never breaks an existing report.
--   - Deliberately NOT unique on `match_text`: two placements can
--     legitimately share wording while reporting separately, and the
--     matcher resolves ambiguity by preferring the longest match.
--   - Attribution lands in the SAME `contacts.attribution_*` columns
--     migration 032 created, with `attribution_source_type = 'link'`.
--     One origin per contact, one place to read it, one export. A real
--     ad referral always wins: it is evidence from Meta, while this is
--     evidence from a sentence the person could have edited.
--
-- RLS
--   Settings-class, mirroring `webhook_endpoints`: any member may read
--   the roster, only admin+ may change it. The webhook matcher runs
--   through the service-role client and bypasses RLS entirely.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Stable reporting key, e.g. 'web-home', 'qr-local', 'bio-ig'.
  code        text NOT NULL,
  -- Human label shown on the contact card, e.g. 'Botón de la web'.
  label       text NOT NULL,
  -- The sentence carried by the prefilled link.
  match_text  text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One code per account: the reporting key has to mean one thing.
CREATE UNIQUE INDEX IF NOT EXISTS lead_sources_account_code_idx
  ON lead_sources (account_id, code);

-- The matcher loads every active source for the account on each
-- first inbound message.
CREATE INDEX IF NOT EXISTS lead_sources_account_active_idx
  ON lead_sources (account_id) WHERE is_active;

ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_sources_select ON lead_sources;
CREATE POLICY lead_sources_select ON lead_sources FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS lead_sources_insert ON lead_sources;
CREATE POLICY lead_sources_insert ON lead_sources FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS lead_sources_update ON lead_sources;
CREATE POLICY lead_sources_update ON lead_sources FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS lead_sources_delete ON lead_sources;
CREATE POLICY lead_sources_delete ON lead_sources FOR DELETE
  USING (is_account_member(account_id, 'admin'));
