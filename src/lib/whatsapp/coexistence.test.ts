import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  handleAppStateSync,
  handleHistory,
  handleMessageEchoes,
  isCoexistenceWebhookField,
  type CoexistenceDeps,
} from './coexistence';

const BUSINESS_PHONE = '15550783881';
const CUSTOMER_PHONE = '16505551234';

/**
 * Records every insert/update this module makes, and answers the
 * dedupe lookup from a set of message ids the caller declares as
 * already stored. Only the surface coexistence.ts actually touches is
 * implemented — anything else throws, so an unintended call fails
 * loudly rather than silently returning undefined.
 */
function makeSupabaseStub(existingMessageIds: string[] = []) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const updates: { table: string; row: Record<string, unknown>; id: unknown }[] = [];
  let conversationRow: { last_message_at: string | null } | null = null;

  const stub = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        update(row: Record<string, unknown>) {
          return {
            eq(_column: string, value: unknown) {
              updates.push({ table, row, id: value });
              return Promise.resolve({ error: null });
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                // messages dedupe: .select().eq().eq().limit()
                eq(_c2: string, messageId: unknown) {
                  return {
                    limit() {
                      return Promise.resolve({
                        data: existingMessageIds.includes(String(messageId))
                          ? [{ id: 'existing' }]
                          : [],
                        error: null,
                      });
                    },
                  };
                },
                // conversations preview guard: .select().eq().maybeSingle()
                maybeSingle() {
                  return Promise.resolve({ data: conversationRow, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    stub: stub as unknown as SupabaseClient,
    inserts,
    updates,
    setConversation(row: { last_message_at: string | null } | null) {
      conversationRow = row;
    },
  };
}

function makeDeps(existingMessageIds: string[] = []) {
  const store = makeSupabaseStub(existingMessageIds);
  const resolveThread = vi.fn(async () => ({
    conversationId: 'conv-1',
    contactId: 'contact-1',
  }));
  const resolveContact = vi.fn(async () => 'contact-1');
  const markHistorySynced = vi.fn(async () => {});

  const deps: CoexistenceDeps = {
    supabase: store.stub,
    accountId: 'acct-1',
    businessPhone: BUSINESS_PHONE,
    resolveThread,
    resolveContact,
    markHistorySynced,
  };

  return { deps, store, resolveThread, resolveContact, markHistorySynced };
}

describe('isCoexistenceWebhookField', () => {
  it('recognises the three coexistence fields', () => {
    expect(isCoexistenceWebhookField('smb_message_echoes')).toBe(true);
    expect(isCoexistenceWebhookField('smb_app_state_sync')).toBe(true);
    expect(isCoexistenceWebhookField('history')).toBe(true);
  });

  it('leaves ordinary message fields alone', () => {
    expect(isCoexistenceWebhookField('messages')).toBe(false);
    expect(isCoexistenceWebhookField('message_template_status_update')).toBe(false);
  });
});

describe('handleMessageEchoes', () => {
  it('files a reply typed on the phone as an agent message', async () => {
    const { deps, store, resolveThread } = makeDeps();

    await handleMessageEchoes(
      {
        metadata: { display_phone_number: BUSINESS_PHONE },
        message_echoes: [
          {
            from: BUSINESS_PHONE,
            to: CUSTOMER_PHONE,
            id: 'wamid.echo1',
            timestamp: '1739321024',
            type: 'text',
            text: { body: 'On my way' },
          },
        ],
      },
      deps,
    );

    // The thread is the CUSTOMER's, not the business's own number.
    expect(resolveThread).toHaveBeenCalledWith(CUSTOMER_PHONE);

    expect(store.inserts).toHaveLength(1);
    expect(store.inserts[0].table).toBe('messages');
    expect(store.inserts[0].row).toMatchObject({
      conversation_id: 'conv-1',
      sender_type: 'agent',
      content_type: 'text',
      content_text: 'On my way',
      message_id: 'wamid.echo1',
      status: 'sent',
    });
  });

  it('clears the unread badge — the owner already answered', async () => {
    const { deps, store } = makeDeps();

    await handleMessageEchoes(
      {
        message_echoes: [
          {
            from: BUSINESS_PHONE,
            to: CUSTOMER_PHONE,
            id: 'wamid.echo2',
            timestamp: '1739321024',
            type: 'text',
            text: { body: 'Handled' },
          },
        ],
      },
      deps,
    );

    const convUpdate = store.updates.find((u) => u.table === 'conversations');
    expect(convUpdate?.row).toMatchObject({
      unread_count: 0,
      last_message_text: 'Handled',
    });
  });

  it('does not insert an echo Meta already delivered', async () => {
    const { deps, store } = makeDeps(['wamid.dup']);

    await handleMessageEchoes(
      {
        message_echoes: [
          {
            from: BUSINESS_PHONE,
            to: CUSTOMER_PHONE,
            id: 'wamid.dup',
            timestamp: '1739321024',
            type: 'text',
            text: { body: 'Sent twice by a webhook retry' },
          },
        ],
      },
      deps,
    );

    expect(store.inserts).toHaveLength(0);
  });

  it('skips an echo with no resolvable counterparty', async () => {
    const { deps, store, resolveThread } = makeDeps();

    await handleMessageEchoes(
      {
        message_echoes: [
          {
            from: BUSINESS_PHONE,
            // `to` missing — nothing to hang the thread on
            id: 'wamid.orphan',
            timestamp: '1739321024',
            type: 'text',
            text: { body: 'nowhere to go' },
          },
        ],
      },
      deps,
    );

    expect(resolveThread).not.toHaveBeenCalled();
    expect(store.inserts).toHaveLength(0);
  });

  it('records a media echo by its caption rather than downloading it', async () => {
    const { deps, store } = makeDeps();

    await handleMessageEchoes(
      {
        message_echoes: [
          {
            from: BUSINESS_PHONE,
            to: CUSTOMER_PHONE,
            id: 'wamid.img',
            timestamp: '1739321024',
            type: 'image',
            image: { id: 'media-1', caption: 'the invoice' },
          },
        ],
      },
      deps,
    );

    expect(store.inserts[0].row).toMatchObject({
      content_type: 'image',
      content_text: 'the invoice',
      media_url: null,
    });
  });
});

describe('handleAppStateSync', () => {
  it('creates a contact for each address-book entry', async () => {
    const { deps, resolveContact } = makeDeps();

    await handleAppStateSync(
      {
        state_sync: [
          {
            type: 'contact',
            action: 'add',
            contact: {
              full_name: 'Pablo Morales',
              first_name: 'Pablo',
              phone_number: CUSTOMER_PHONE,
            },
            metadata: { timestamp: '1739321024' },
          },
        ],
      },
      deps,
    );

    expect(resolveContact).toHaveBeenCalledWith(CUSTOMER_PHONE, 'Pablo Morales');
  });

  it('never deletes a CRM contact when the phone drops one', async () => {
    const { deps, resolveContact, store } = makeDeps();

    await handleAppStateSync(
      {
        state_sync: [
          {
            type: 'contact',
            action: 'remove',
            contact: { phone_number: CUSTOMER_PHONE },
            metadata: { timestamp: '1739321024' },
          },
        ],
      },
      deps,
    );

    expect(resolveContact).not.toHaveBeenCalled();
    expect(store.inserts).toHaveLength(0);
    expect(store.updates).toHaveLength(0);
  });
});

describe('handleHistory', () => {
  const chunk = (messages: unknown[], progress = 50) => ({
    history: [
      {
        metadata: { phase: 0, chunk_order: 1, progress },
        threads: [{ id: CUSTOMER_PHONE, messages: messages as never }],
      },
    ],
  });

  it('assigns direction from the sender, not the payload order', async () => {
    const { deps, store } = makeDeps();

    await handleHistory(
      chunk([
        {
          from: BUSINESS_PHONE,
          id: 'wamid.h1',
          timestamp: '1739230955',
          type: 'text',
          text: { body: "Here's the info" },
          history_context: { status: 'READ' },
        },
        {
          from: CUSTOMER_PHONE,
          id: 'wamid.h2',
          timestamp: '1739230999',
          type: 'text',
          text: { body: 'Thanks!' },
          history_context: { status: 'DELIVERED' },
        },
      ]),
      deps,
    );

    expect(store.inserts).toHaveLength(2);
    expect(store.inserts[0].row).toMatchObject({
      sender_type: 'agent',
      status: 'read',
    });
    expect(store.inserts[1].row).toMatchObject({
      sender_type: 'customer',
      status: 'delivered',
    });
  });

  it('maps PLAYED voice receipts onto read', async () => {
    const { deps, store } = makeDeps();

    await handleHistory(
      chunk([
        {
          from: CUSTOMER_PHONE,
          id: 'wamid.voice',
          timestamp: '1739230955',
          type: 'audio',
          audio: { id: 'media-9' },
          history_context: { status: 'PLAYED' },
        },
      ]),
      deps,
    );

    expect(store.inserts[0].row).toMatchObject({
      content_type: 'audio',
      status: 'read',
    });
  });

  it('does not rewind the inbox preview to an older message', async () => {
    const { deps, store } = makeDeps();
    // Thread already has live traffic newer than this import.
    store.setConversation({ last_message_at: '2026-08-01T00:00:00.000Z' });

    await handleHistory(
      chunk([
        {
          from: CUSTOMER_PHONE,
          id: 'wamid.old',
          timestamp: '1739230955', // Feb 2025
          type: 'text',
          text: { body: 'ancient history' },
          history_context: { status: 'READ' },
        },
      ]),
      deps,
    );

    expect(store.inserts).toHaveLength(1); // still imported
    expect(store.updates.find((u) => u.table === 'conversations')).toBeUndefined();
  });

  it('advances the preview when the import IS the newest message', async () => {
    const { deps, store } = makeDeps();
    store.setConversation({ last_message_at: null });

    await handleHistory(
      chunk([
        {
          from: CUSTOMER_PHONE,
          id: 'wamid.first',
          timestamp: '1739230955',
          type: 'text',
          text: { body: 'first ever' },
          history_context: { status: 'READ' },
        },
      ]),
      deps,
    );

    expect(store.updates.find((u) => u.table === 'conversations')?.row).toMatchObject({
      last_message_text: 'first ever',
    });
  });

  it('stamps completion only when Meta reports 100%', async () => {
    const partial = makeDeps();
    await handleHistory(chunk([], 60), partial.deps);
    expect(partial.markHistorySynced).not.toHaveBeenCalled();

    const done = makeDeps();
    await handleHistory(chunk([], 100), done.deps);
    expect(done.markHistorySynced).toHaveBeenCalledOnce();
  });

  it('skips history messages already imported by an overlapping chunk', async () => {
    const { deps, store } = makeDeps(['wamid.seen']);

    await handleHistory(
      chunk([
        {
          from: CUSTOMER_PHONE,
          id: 'wamid.seen',
          timestamp: '1739230955',
          type: 'text',
          text: { body: 'already here' },
        },
      ]),
      deps,
    );

    expect(store.inserts).toHaveLength(0);
  });
});
