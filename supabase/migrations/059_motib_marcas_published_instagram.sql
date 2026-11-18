-- ============================================================
-- 059_motib_marcas_published_instagram.sql — fork-only (Motib)
--
-- What each brand actually published on Instagram, so the Marcas
-- summary can compare it with the content plan ("4 of 5 went out").
--
-- Read through Meta's Graph API as a read-only business system user
-- (partner access to each client's portfolio). Its token lives in
-- marcas_integrations, id 'meta', encrypted like the Google one:
-- credentials = encrypt(JSON {"token": "...", "cronSecret": "..."}).
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

-- When each brand was first and last read. Stories older than the first
-- read were never seen, so the summary shows them as unknown, not as 0.
CREATE TABLE IF NOT EXISTS marcas_ig_sync (
  brand_id TEXT PRIMARY KEY REFERENCES marcas_brands(id) ON DELETE CASCADE,
  first_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marcas_ig_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas_ig_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marcas_ig_media, marcas_ig_sync FROM anon;
REVOKE INSERT, UPDATE, DELETE ON marcas_ig_media, marcas_ig_sync FROM authenticated;

DROP POLICY IF EXISTS marcas_ig_media_select ON marcas_ig_media;
CREATE POLICY marcas_ig_media_select ON marcas_ig_media
  FOR SELECT TO authenticated
  USING (public.marcas_can_see_brand(brand_id));

DROP POLICY IF EXISTS marcas_ig_sync_select ON marcas_ig_sync;
CREATE POLICY marcas_ig_sync_select ON marcas_ig_sync
  FOR SELECT TO authenticated
  USING (public.marcas_can_see_brand(brand_id));
