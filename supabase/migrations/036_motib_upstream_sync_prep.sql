-- ============================================================
-- 036_motib_upstream_sync_prep.sql — fork-only (Motib)
--
-- Reconciles this fork's migrations 031–036 with upstream's 036–037
-- before upstream 037 runs. Sorts after both 036 files and before 037
-- on purpose; see docs/FORK.md for the naming rule.
--
-- 1. idx_messages_conversation_message_id
--    Fork 031 (coexistence) created this name as a PLAIN index, because
--    deduping live messages was out of scope then. Upstream 037 creates
--    the same name as a UNIQUE index with `IF NOT EXISTS` — on a DB that
--    ran 031 it would silently keep the plain one. The upstream webhook
--    then upserts with `onConflict: 'conversation_id,message_id'`, which
--    Postgres rejects without a matching unique index: every inbound
--    message would fail to insert. Dropping the plain index lets 037
--    dedupe and recreate it as UNIQUE. Duplicates it deletes are exact
--    Meta replays (same conversation, same wamid), not distinct messages.
--
-- 2. conversations_account_contact_idx
--    Fork 034 and upstream 036 fixed the same split-thread bug and each
--    added a unique index on conversations (account_id, contact_id).
--    Once upstream's idx_conversations_account_contact exists, ours is a
--    redundant copy that only costs writes.
--
-- Idempotent: safe to run more than once, and a no-op on a fresh
-- install that never had the fork's plain index.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relname = 'idx_messages_conversation_message_id'
      AND NOT i.indisunique
  ) THEN
    DROP INDEX idx_messages_conversation_message_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'idx_conversations_account_contact'
  ) THEN
    DROP INDEX IF EXISTS conversations_account_contact_idx;
  END IF;
END $$;
