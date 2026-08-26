/**
 * Proves the chat still works when the Phase 3 migrations have NOT been applied.
 *
 * This is the case that ships first: the code goes live, the SQL has not been run
 * yet, and `messages.reply_to_id` / `message_reactions` do not exist. Loading a
 * thread must not break, and sending must still deliver the message.
 *
 * Run: node --experimental-strip-types packages/synth-shared/src/chatDegradation.test.ts
 */

import assert from 'node:assert/strict';
import { createChatCore, __resetReplyColumnProbe } from './chatCore.ts';
import { createChatReactions, __resetReactionsTableProbe } from './chatReactions.ts';

const UNDEFINED_COLUMN = '42703';
const UNDEFINED_TABLE = '42P01';

const CHAT_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';
const USER_ID = 'bb22cc33-dd44-4e55-9f66-001122334455';

const crypto = {
  encryptMessage: async (text: string) => `enc(${text})`,
  decryptMessage: async (payload: string) => payload.replace(/^enc\(|\)$/g, ''),
  decryptChatMessage: async (m: { content: string }) => m.content.replace(/^enc\(|\)$/g, ''),
  isEncrypted: () => true,
  deleteChatKey: async () => {},
} as any;

/**
 * Minimal Supabase stand-in. `replyColumnExists: false` makes any select or
 * insert naming reply_to_id fail exactly the way Postgres would.
 */
function stubSupabase(options: { replyColumnExists: boolean; reactionsTableExists: boolean }) {
  const calls: string[] = [];

  function messagesTable() {
    let selectedColumns = '';
    const builder: any = {
      select(columns: string) {
        selectedColumns = columns;
        return builder;
      },
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit() {
        calls.push(`select:${selectedColumns.includes('reply_to_id') ? 'with-reply' : 'plain'}`);
        if (selectedColumns.includes('reply_to_id') && !options.replyColumnExists) {
          return Promise.resolve({ data: null, error: { code: UNDEFINED_COLUMN } });
        }
        return Promise.resolve({
          data: [
            {
              id: 'msg-1',
              chat_id: CHAT_ID,
              sender_id: USER_ID,
              content: 'enc(hello there)',
              is_encrypted: true,
              created_at: '2026-08-25T10:00:00Z',
              message_type: null,
              shared_event_id: null,
              shared_review_id: null,
              metadata: null,
            },
          ],
          error: null,
        });
      },
      insert(row: Record<string, unknown>) {
        const hasReply = 'reply_to_id' in row;
        calls.push(`insert:${hasReply ? 'with-reply' : 'plain'}`);
        if (hasReply && !options.replyColumnExists) {
          return {
            select: () => ({
              single: () => Promise.resolve({ data: null, error: { code: UNDEFINED_COLUMN } }),
            }),
          };
        }
        return {
          select: () => ({ single: () => Promise.resolve({ data: { id: 'new-msg' }, error: null }) }),
        };
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      delete: () => builder,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    return builder;
  }

  function reactionsTable() {
    const missing = { data: null, error: { code: UNDEFINED_TABLE } };
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => (options.reactionsTableExists ? Promise.resolve({ data: [], error: null }) : Promise.resolve(missing)),
      maybeSingle: () => Promise.resolve(options.reactionsTableExists ? { data: null, error: null } : missing),
      insert: () => Promise.resolve(options.reactionsTableExists ? { error: null } : missing),
      delete: () => builder,
    };
    return builder;
  }

  const emptyTable: any = {
    select: () => emptyTable,
    eq: () => emptyTable,
    neq: () => emptyTable,
    in: () => Promise.resolve({ data: [], error: null }),
    limit: () => Promise.resolve({ data: [], error: null }),
    order: () => emptyTable,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    // sendChatMessage bumps chats.updated_at so the list re-sorts.
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    delete: () => emptyTable,
  };

  return {
    calls,
    client: {
      from(table: string) {
        if (table === 'messages') return messagesTable();
        if (table === 'message_reactions') return reactionsTable();
        return emptyTable;
      },
      rpc: () => Promise.resolve({ data: null, error: { code: 'x' } }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    } as any,
  };
}

async function withoutMigrations() {
  __resetReplyColumnProbe();
  __resetReactionsTableProbe();
  const stub = stubSupabase({ replyColumnExists: false, reactionsTableExists: false });
  const core = createChatCore({ supabase: stub.client, crypto });

  // Loading a thread must succeed even though reply_to_id does not exist.
  const first = await core.fetchChatMessages(CHAT_ID, USER_ID);
  assert.equal(first.error, null, 'thread must load without migration 01');
  assert.equal(first.data.length, 1);
  assert.equal(first.data[0]!.content, 'hello there', 'message still decrypts');
  assert.equal(first.data[0]!.reply_to_id, null);
  assert.deepEqual(
    stub.calls,
    ['select:with-reply', 'select:plain'],
    'probes once, then falls back'
  );

  // The probe is remembered — a second load must not retry the failing query.
  stub.calls.length = 0;
  const second = await core.fetchChatMessages(CHAT_ID, USER_ID);
  assert.equal(second.error, null);
  assert.deepEqual(stub.calls, ['select:plain'], 'probe result is cached for the session');

  // Sending a reply must still deliver the message, just without the quote link.
  stub.calls.length = 0;
  const sent = await core.sendChatMessage(CHAT_ID, USER_ID, 'hi', { reply_to_id: 'msg-1' });
  assert.equal(sent.error, null, 'message must send even though the reply link cannot be stored');
  assert.deepEqual(stub.calls, ['insert:plain'], 'already-probed, so it skips the doomed insert');

  // Reactions degrade to "none" rather than throwing.
  const reactions = createChatReactions({ supabase: stub.client });
  const map = await reactions.fetchReactions(['msg-1'], USER_ID);
  assert.equal(map.size, 0, 'missing message_reactions table yields an empty map');

  // And once that probe has failed, no realtime channel is opened against the
  // missing table — otherwise it errors and retries for the whole session.
  let channelOpened = false;
  const watched = createChatReactions({
    supabase: { ...stub.client, channel: () => { channelOpened = true; return { on: () => ({ subscribe: () => ({}) }) }; } } as any,
  });
  const unsubscribe = watched.subscribeToReactions(CHAT_ID, () => {});
  assert.equal(channelOpened, false, 'must not subscribe to a table that does not exist');
  unsubscribe();

  console.log('  without migrations: thread loads, message sends, reactions inert, no dead channel');
}

async function withMigrations() {
  __resetReplyColumnProbe();
  __resetReactionsTableProbe();
  const stub = stubSupabase({ replyColumnExists: true, reactionsTableExists: true });
  const core = createChatCore({ supabase: stub.client, crypto });

  const loaded = await core.fetchChatMessages(CHAT_ID, USER_ID);
  assert.equal(loaded.error, null);
  assert.deepEqual(stub.calls, ['select:with-reply'], 'no fallback needed once applied');

  stub.calls.length = 0;
  const sent = await core.sendChatMessage(CHAT_ID, USER_ID, 'hi', { reply_to_id: 'msg-1' });
  assert.equal(sent.error, null);
  assert.deepEqual(stub.calls, ['insert:with-reply'], 'reply link is stored');

  console.log('  with migrations: reply column used on both read and write');
}

await withoutMigrations();
await withMigrations();
console.log('chatDegradation: all checks passed');
