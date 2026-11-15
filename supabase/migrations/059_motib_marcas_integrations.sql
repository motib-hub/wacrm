-- ============================================================
-- 059_motib_marcas_integrations.sql — fork-only (Motib)
--
-- Server-side credentials for Marcas integrations. First (and so far
-- only) row: 'google' — a read-only Google service account that reads
-- the brands' content-plan spreadsheets and their Drive folders, so the
-- content board can preview what the team uploads without anyone
-- installing an Apps Script per sheet.
--
-- `credentials` holds the service-account JSON encrypted with the app's
-- ENCRYPTION_KEY (same AES-256-GCM format as whatsapp_config tokens,
-- src/lib/whatsapp/encryption.ts). `client_email` stays in clear: it is
-- the address files are shared with, not a secret.
--
-- RLS on with NO policies: only the service role (server routes) can
-- read or write it. Not even a Marcas admin reads it from the browser.
-- ============================================================

CREATE TABLE IF NOT EXISTS marcas_integrations (
  id TEXT PRIMARY KEY CHECK (id IN ('google')),
  client_email TEXT NOT NULL,
  credentials TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marcas_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marcas_integrations FROM anon, authenticated;
