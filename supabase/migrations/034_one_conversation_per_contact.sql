-- ============================================================
-- 034_one_conversation_per_contact.sql
--
-- The whole app assumes one conversation per (account, contact): the
-- inbox lists a thread per person, the webhook looks one up by contact
-- before every insert, and the public API resolver does the same. That
-- convention was only ever a convention — nothing in the schema held
-- it — and it broke in production.
--
-- How it broke: an inbound message and its Coexistence echo arrive
-- milliseconds apart. Both looked for a conversation, both found none,
-- both created one. From then on the lookup used `.single()`, which
-- errors on *more than one* row exactly as it errors on none — and the
-- caller read that error as "no conversation exists". So every later
-- message created yet another thread. One lost race became one thread
-- per message: a single customer's conversation shattered across the
-- inbox, each fragment holding one line of what was said.
--
-- This migration does the two things code alone cannot:
--   1. Merges the fragments already created, oldest thread wins.
--   2. Adds the unique index, so the race can never create the first
--      duplicate again. The callers now catch 23505 and re-read.
--
-- Idempotent — safe to run more than once.
-- ============================================================

BEGIN;

-- ---------- 1. Pick the survivor for each contact ----------
-- Oldest thread wins: it holds the start of the conversation, and its
-- id is the one already referenced by anything created early on.
CREATE TEMP TABLE conv_keep ON COMMIT DROP AS
SELECT DISTINCT ON (account_id, contact_id)
       account_id, contact_id, id AS keep_id
FROM conversations
ORDER BY account_id, contact_id, created_at, id;

CREATE TEMP TABLE conv_merge ON COMMIT DROP AS
SELECT c.id AS dup_id, k.keep_id
FROM conversations c
JOIN conv_keep k
  ON k.account_id = c.account_id
 AND k.contact_id = c.contact_id
WHERE c.id <> k.keep_id;

-- ---------- 2. Repoint everything at the survivor ----------
-- Messages carry the actual conversation; without this the merge would
-- delete what the customer said.
UPDATE messages m
SET conversation_id = cm.keep_id
FROM conv_merge cm
WHERE m.conversation_id = cm.dup_id;

UPDATE message_reactions r
SET conversation_id = cm.keep_id
FROM conv_merge cm
WHERE r.conversation_id = cm.dup_id;

-- Deals reference the conversation without ON DELETE behaviour, so an
-- unmoved deal would block the delete below outright.
UPDATE deals d
SET conversation_id = cm.keep_id
FROM conv_merge cm
WHERE d.conversation_id = cm.dup_id;

UPDATE flow_runs f
SET conversation_id = cm.keep_id
FROM conv_merge cm
WHERE f.conversation_id = cm.dup_id;

UPDATE notifications n
SET conversation_id = cm.keep_id
FROM conv_merge cm
WHERE n.conversation_id = cm.dup_id;

-- ---------- 3. Drop the fragments ----------
DELETE FROM conversations c
USING conv_merge cm
WHERE c.id = cm.dup_id;

-- ---------- 4. Rebuild the inbox preview on the survivors ----------
-- The merged thread's last_message_* still describe whichever fragment
-- won, which is the oldest one — so without this the inbox would show
-- the first line of a conversation as its most recent activity.
UPDATE conversations c
SET last_message_text = m.content_text,
    last_message_at   = m.created_at,
    updated_at        = now()
FROM (
  SELECT DISTINCT ON (conversation_id)
         conversation_id, content_text, created_at
  FROM messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE m.conversation_id = c.id
  AND c.id IN (SELECT keep_id FROM conv_merge);

-- ---------- 5. Make it impossible from here on ----------
-- The index is what actually enforces the convention. Both find-or-create
-- callers now treat a 23505 here as "someone else won, re-read".
CREATE UNIQUE INDEX IF NOT EXISTS conversations_account_contact_idx
  ON conversations (account_id, contact_id);

COMMIT;
