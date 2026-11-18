-- ============================================================
-- 059_motib_marcas_published_instagram.sql — fork-only (Motib)
--
-- What each brand actually published on Instagram, so the Marcas
-- summary can compare it with the content plan ("4 of 5 went out").
--
-- Read through Meta's Graph API as a read-only business system user
-- (partner access to each client's portfolio). Its token lives in
-- marcas_integrations, id 'meta', encrypted like the Google one:
-- credentials = encrypt(JSON {"token": "...", "cronSecret": "..."}), and
-- client_email (NOT NULL, meant for Google's robot) holds the system
-- user's name, which is not a secret.
-- `cronSecret` authenticates the scheduled sync (see
-- src/app/api/marcas/instagram/sync/route.ts).
--
-- Stories disappear from the API after 24 h, so a scheduled sync keeps
-- a copy of what it saw: one row per post or story, never edited by
-- people. Only ids, type, time and permalink are kept — no captions,
-- no images.
--
-- RLS: anyone who can see the brand reads its rows; only the service
-- role writes them.
-- ============================================================

ALTER TABLE marcas_brands ADD COLUMN IF NOT EXISTS instagram_username TEXT;
-- One account per brand: two brands on the same handle would fight over its rows.
CREATE UNIQUE INDEX IF NOT EXISTS marcas_brands_instagram_username
  ON marcas_brands (lower(instagram_username)) WHERE instagram_username IS NOT NULL;

ALTER TABLE marcas_integrations DROP CONSTRAINT IF EXISTS marcas_integrations_id_check;
ALTER TABLE marcas_integrations ADD CONSTRAINT marcas_integrations_id_check
  CHECK (id IN ('google', 'meta'));

CREATE TABLE IF NOT EXISTS marcas_ig_media (
  id TEXT PRIMARY KEY,                       -- Instagram media id
  brand_id TEXT NOT NULL REFERENCES marcas_brands(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('feed', 'story')),
  media_type TEXT NOT NULL,                  -- IMAGE | VIDEO | CAROUSEL_ALBUM
  taken_at TIMESTAMPTZ NOT NULL,
  permalink TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marcas_ig_media_brand_time ON marcas_ig_media (brand_id, taken_at);

-- Every successful read of a brand. A story is visible for 24 h, so a
-- day's stories count only if the reads around it are never more than
-- 24 h apart (src/lib/marcas/instagram/tally.ts → storiesCovered); a
-- missed schedule shows "?" instead of a false 0. Pruned after 90 days.
CREATE TABLE IF NOT EXISTS marcas_ig_sync_log (
  id BIGSERIAL PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES marcas_brands(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marcas_ig_sync_log_brand_at ON marcas_ig_sync_log (brand_id, at);

ALTER TABLE marcas_ig_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas_ig_sync_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marcas_ig_media, marcas_ig_sync_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON marcas_ig_media, marcas_ig_sync_log FROM authenticated;

DROP POLICY IF EXISTS marcas_ig_media_select ON marcas_ig_media;
CREATE POLICY marcas_ig_media_select ON marcas_ig_media
  FOR SELECT TO authenticated
  USING (public.marcas_can_see_brand(brand_id));

DROP POLICY IF EXISTS marcas_ig_sync_log_select ON marcas_ig_sync_log;
CREATE POLICY marcas_ig_sync_log_select ON marcas_ig_sync_log
  FOR SELECT TO authenticated
  USING (public.marcas_can_see_brand(brand_id));
