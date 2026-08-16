-- ============================================================
-- Click-to-WhatsApp attribution
--
-- When someone reaches the business by tapping a Click-to-WhatsApp
-- ad (or an ad-derived link), Meta attaches a `referral` object to the
-- inbound message describing where the click came from: the ad id, the
-- headline and body they actually saw, the source URL with whatever
-- UTMs it carried, and `ctwa_clid` — the click id Meta's Conversions
-- API needs to attribute a sale back to the ad.
--
-- Until now the webhook discarded all of it. That block is the whole
-- point of a traceability layer: it answers "which ad produced this
-- lead" automatically, which is precisely the column a salesperson
-- cannot fill by hand across two thousand enquiries a month.
--
-- ─── Two levels, on purpose ──────────────────────────────────────
--
--   messages.referral   — the raw object, per message, nothing lost.
--                         Meta only sends it on the FIRST message of
--                         an ad-originated conversation, so this is
--                         sparse by nature.
--
--   contacts.attribution_*  — FIRST-TOUCH, denormalised for reporting.
--                         "Which ad brought this lead" means the ad
--                         that produced them, not the most recent one
--                         they happened to click. The webhook writes
--                         these only when they are still empty, so a
--                         later ad click can never overwrite the
--                         origin. Last-touch remains derivable from
--                         messages.referral if it's ever wanted.
--
-- ─── Attribution has to be switched on ───────────────────────────
-- Meta omits the referral object entirely unless attribution is
-- enabled on the WhatsApp Business Account. A contact with no
-- attribution may mean organic arrival OR a disabled setting; the two
-- are indistinguishable from here, so check the setting before
-- concluding the ads aren't working.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS referral JSONB;

ALTER TABLE contacts
  -- 'ad' or 'post'.
  ADD COLUMN IF NOT EXISTS attribution_source_type TEXT,
  -- The ad id / post id. This is the join key for "leads per ad".
  ADD COLUMN IF NOT EXISTS attribution_source_id TEXT,
  -- The link that opened the chat — carries UTMs when it had them.
  ADD COLUMN IF NOT EXISTS attribution_source_url TEXT,
  -- The creative the person actually saw before writing.
  ADD COLUMN IF NOT EXISTS attribution_headline TEXT,
  ADD COLUMN IF NOT EXISTS attribution_body TEXT,
  -- Meta's click id. Required by the Conversions API to report a
  -- conversion back against the click, so it is worth keeping even
  -- though nothing reads it yet.
  ADD COLUMN IF NOT EXISTS attribution_ctwa_clid TEXT,
  -- Parsed utm_* pairs from attribution_source_url, so the common
  -- reporting cut doesn't require re-parsing a URL in every query.
  ADD COLUMN IF NOT EXISTS attribution_utm JSONB,
  -- When first touch was captured. Doubles as the "already attributed"
  -- flag the webhook checks before writing.
  ADD COLUMN IF NOT EXISTS attribution_at TIMESTAMPTZ,
  -- The untouched referral object behind the columns above, so a
  -- field Meta adds later isn't lost before we model it.
  ADD COLUMN IF NOT EXISTS attribution_raw JSONB;

-- "How many leads did ad X produce" — the query this whole migration
-- exists to serve. Partial: most contacts arrive organically and
-- carry no attribution at all.
CREATE INDEX IF NOT EXISTS idx_contacts_attribution_source_id
  ON contacts (account_id, attribution_source_id)
  WHERE attribution_source_id IS NOT NULL;

-- Supports date-bounded attribution reporting ("ad-sourced leads last
-- month") without scanning the organic majority.
CREATE INDEX IF NOT EXISTS idx_contacts_attribution_at
  ON contacts (account_id, attribution_at DESC)
  WHERE attribution_at IS NOT NULL;
