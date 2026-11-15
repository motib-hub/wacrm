-- ============================================================
-- 059_motib_marcas.sql — fork-only (Motib): the "Marcas" module
--
-- An agency workspace that lives next to the CRM but shares none of its
-- tenancy: brands (the agency's clients), their task board, and the team
-- that works them. The CRM's own model allows one account per user, and
-- a teammate who only works brands must not see any WhatsApp inbox — so
-- Marcas keeps its OWN membership table instead of reusing `profiles`.
--
-- Roles
--   admin  — sees and edits every brand, manages members.
--   equipo — sees only brands flagged `team_visible`, works their tasks.
--
-- No seed data on purpose: this repo is public and brands are real
-- clients. Brands, members and starting tasks are loaded from a private
-- SQL file kept outside the repo.
--
-- Idempotent: tables use IF NOT EXISTS, policies are dropped before
-- being recreated.
-- ============================================================

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marcas_members (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'equipo')),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marcas_brands (
  -- Readable slug, used in the URL: /marcas/rodimar
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  color TEXT NOT NULL DEFAULT '#5dbea3' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  tagline TEXT,
  contact_name TEXT,
  team_visible BOOLEAN NOT NULL DEFAULT FALSE,
  -- Content plan spreadsheet and shared Drive folder for the brand.
  sheet_url TEXT CHECK (sheet_url IS NULL OR sheet_url ~ '^https://'),
  drive_url TEXT CHECK (drive_url IS NULL OR drive_url ~ '^https://'),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marcas_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES marcas_brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  -- hacer = to do · curso = in progress · cliente = waiting on the
  -- client · hecho = done. "Waiting on the client" is a column, not an
  -- assignee: it is the state the agency most needs to see at a glance.
  status TEXT NOT NULL DEFAULT 'hacer'
    CHECK (status IN ('hacer', 'curso', 'cliente', 'hecho')),
  assignee_id UUID REFERENCES marcas_members(user_id) ON DELETE SET NULL,
  due_date DATE,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marcas_tasks_brand_status
  ON marcas_tasks (brand_id, status);

-- ------------------------------------------------------------
-- Timestamps
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marcas_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  IF TG_TABLE_NAME = 'marcas_tasks' THEN
    IF NEW.status = 'hecho' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'hecho') THEN
      NEW.done_at := NOW();
    ELSIF NEW.status <> 'hecho' THEN
      NEW.done_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marcas_brands_touch ON marcas_brands;
CREATE TRIGGER marcas_brands_touch
  BEFORE UPDATE ON marcas_brands
  FOR EACH ROW EXECUTE FUNCTION public.marcas_touch();

DROP TRIGGER IF EXISTS marcas_tasks_touch ON marcas_tasks;
CREATE TRIGGER marcas_tasks_touch
  BEFORE INSERT OR UPDATE ON marcas_tasks
  FOR EACH ROW EXECUTE FUNCTION public.marcas_touch();

-- ------------------------------------------------------------
-- Access helpers
--
-- SECURITY DEFINER so policies can read marcas_members without
-- recursing into marcas_members' own RLS. Both only ever look at the
-- caller (auth.uid()), so they leak nothing about other users.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marcas_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM marcas_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.marcas_can_see_brand(p_brand_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.marcas_role()
    WHEN 'admin' THEN TRUE
    WHEN 'equipo' THEN COALESCE(
      (SELECT team_visible FROM marcas_brands WHERE id = p_brand_id), FALSE)
    ELSE FALSE
  END
$$;

REVOKE ALL ON FUNCTION public.marcas_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcas_can_see_brand(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcas_touch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcas_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcas_can_see_brand(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Row level security
-- ------------------------------------------------------------

ALTER TABLE marcas_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas_tasks ENABLE ROW LEVEL SECURITY;

-- Members: any member reads the roster (names for the assignee picker);
-- only an admin changes it.
DROP POLICY IF EXISTS marcas_members_select ON marcas_members;
CREATE POLICY marcas_members_select ON marcas_members
  FOR SELECT TO authenticated
  USING (public.marcas_role() IS NOT NULL);

DROP POLICY IF EXISTS marcas_members_write ON marcas_members;
CREATE POLICY marcas_members_write ON marcas_members
  FOR ALL TO authenticated
  USING (public.marcas_role() = 'admin')
  WITH CHECK (public.marcas_role() = 'admin');

-- Brands: visibility per role; only an admin edits them.
DROP POLICY IF EXISTS marcas_brands_select ON marcas_brands;
CREATE POLICY marcas_brands_select ON marcas_brands
  FOR SELECT TO authenticated
  USING (public.marcas_can_see_brand(id));

DROP POLICY IF EXISTS marcas_brands_write ON marcas_brands;
CREATE POLICY marcas_brands_write ON marcas_brands
  FOR ALL TO authenticated
  USING (public.marcas_role() = 'admin')
  WITH CHECK (public.marcas_role() = 'admin');

-- Tasks: anyone who can see the brand works its board. WITH CHECK on
-- the new row stops moving a task into a brand the caller cannot see.
DROP POLICY IF EXISTS marcas_tasks_all ON marcas_tasks;
CREATE POLICY marcas_tasks_all ON marcas_tasks
  FOR ALL TO authenticated
  USING (public.marcas_can_see_brand(brand_id))
  WITH CHECK (public.marcas_can_see_brand(brand_id));

REVOKE ALL ON marcas_members, marcas_brands, marcas_tasks FROM anon;
