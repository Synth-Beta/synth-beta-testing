/**
 * Checks for the Phase 3 chat feature logic that can be exercised without a database:
 * reaction grouping, quote previews, and the typing-indicator wording.
 *
 * Run: node --experimental-strip-types packages/synth-shared/src/chatFeatures.test.ts
 */

import assert from 'node:assert/strict';
import { summarizeReactions, type MessageReactionRow } from './chatReactions.ts';
import { quotePreview } from './chatCore.ts';
import { formatTypingIndicator, joinChatPresence } from './chatPresence.ts';
import { wouldNotify, muteReason } from './chatNotificationPolicy.ts';

const ME = 'user-me';
const THEM = 'user-them';
const THIRD = 'user-third';

function reactions() {
  const rows: MessageReactionRow[] = [
    { message_id: 'm1', user_id: ME, emoji: '❤️' },
    { message_id: 'm1', user_id: THEM, emoji: '❤️' },
    { message_id: 'm1', user_id: THIRD, emoji: '🔥' },
    { message_id: 'm2', user_id: THEM, emoji: '😂' },
  ];

  const summary = summarizeReactions(rows, ME);

  const m1 = summary.get('m1')!;
  assert.equal(m1.length, 2, 'two distinct emoji on m1');
  // Sorted by count desc: ❤️ (2) before 🔥 (1).
  assert.equal(m1[0]!.emoji, '❤️');
  assert.equal(m1[0]!.count, 2);
  assert.equal(m1[0]!.reactedByMe, true);
  assert.equal(m1[1]!.emoji, '🔥');
  assert.equal(m1[1]!.count, 1);
  assert.equal(m1[1]!.reactedByMe, false, 'someone else reacted, not me');

  const m2 = summary.get('m2')!;
  assert.equal(m2[0]!.count, 1);
  assert.equal(m2[0]!.reactedByMe, false);

  // A realtime INSERT can race the initial fetch and deliver the same row twice.
  // The count must not double.
  const duplicated = summarizeReactions(
    [
      { message_id: 'm3', user_id: THEM, emoji: '👍' },
      { message_id: 'm3', user_id: THEM, emoji: '👍' },
    ],
    ME
  );
  assert.equal(duplicated.get('m3')![0]!.count, 1, 'duplicate row must not double the count');

  // Ties break alphabetically so the row does not reorder between renders.
  const tied = summarizeReactions(
    [
      { message_id: 'm4', user_id: ME, emoji: '🔥' },
      { message_id: 'm4', user_id: THEM, emoji: '❤️' },
    ],
    ME
  );
  const order = tied.get('m4')!.map((r) => r.emoji);
  assert.deepEqual(order, [...order].sort((a, b) => a.localeCompare(b)), 'tied counts sort stably');

  assert.equal(summarizeReactions([], ME).size, 0);
  console.log('  reactions: grouping, self-flag, dedupe, stable order');
}

function quotes() {
  assert.equal(quotePreview({ content: 'see you there', message_type: 'text' }), 'see you there');
  assert.equal(quotePreview({ content: 'anything', message_type: 'image' }), 'Photo');
  assert.equal(quotePreview({ content: '', message_type: 'event_share' }), 'Shared an event');
  assert.equal(quotePreview({ content: '', message_type: 'review_share' }), 'Shared a review');
  assert.equal(quotePreview({ content: '   ', message_type: 'text' }), 'Message');

  // Newlines collapse so a quote bar stays one line.
  assert.equal(quotePreview({ content: 'a\n\nb', message_type: 'text' }), 'a b');

  const long = 'x'.repeat(500);
  const preview = quotePreview({ content: long, message_type: 'text' });
  assert.equal(preview.length, 120, 'truncated to 119 chars plus ellipsis');
  assert.ok(preview.endsWith('…'));
  console.log('  quotes: labels, whitespace collapse, truncation');
}

function typing() {
  assert.equal(formatTypingIndicator([]), '');
  assert.equal(formatTypingIndicator([{ userId: 'a', name: 'Alex' }]), 'Alex is typing…');
  assert.equal(
    formatTypingIndicator([
      { userId: 'a', name: 'Alex' },
      { userId: 'b', name: 'Sam' },
    ]),
    'Alex and Sam are typing…'
  );
  assert.equal(
    formatTypingIndicator([
      { userId: 'a', name: 'Alex' },
      { userId: 'b', name: 'Sam' },
      { userId: 'c', name: 'Jo' },
    ]),
    '3 people are typing…'
  );
  console.log('  typing: 0/1/2/many wording');
}

/**
 * Regression: "cannot add presence callbacks after joining a channel".
 *
 * RealtimeClient.channel(topic) returns an EXISTING channel for a topic rather
 * than creating a new one, and RealtimeChannel.on() throws for presence
 * listeners once the channel has joined. Reopening the same chat therefore
 * crashed. This stub reproduces both behaviours exactly.
 */
function presenceReuse() {
  let channelCalls = 0;
  let broadcastListeners = 0;
  const sent: unknown[] = [];
  const channels = new Map<string, any>();

  const supabase: any = {
    channel(topic: string) {
      channelCalls += 1;
      const existing = channels.get(topic);
      if (existing) return existing; // real client dedupes by topic
      const chan: any = {
        joined: false,
        on(type: string, _filter: unknown, _cb: unknown) {
          // Real guard: presence listeners are rejected after joining.
          if (chan.joined && type === 'presence') {
            throw new Error('cannot add presence callbacks after joining a channel');
          }
          if (type === 'broadcast') broadcastListeners += 1;
          return chan;
        },
        subscribe() {
          chan.joined = true;
          return chan;
        },
        send(msg: unknown) {
          sent.push(msg);
          return Promise.resolve('ok');
        },
      };
      channels.set(topic, chan);
      return chan;
    },
    removeChannel: () => Promise.resolve('ok'),
  };

  const options = { chatId: 'chat-1', userId: 'me', userName: 'Alex' };

  const first = joinChatPresence(supabase, { ...options, onTypingChange: () => {} });
  first.setTyping(true);
  void first.leave();

  // The crash was here: remounting the same chat re-entered a joined channel.
  const second = joinChatPresence(supabase, { ...options, onTypingChange: () => {} });
  second.setTyping(true);
  void second.leave();

  // Stronger than just relying on the client's own dedupe: the room registry
  // means the second mount never asks the client for a channel at all.
  assert.equal(channelCalls, 1, 'channel created once for the chat');
  assert.equal(channels.size, 1, 'one channel per chat topic');
  assert.equal(
    broadcastListeners,
    1,
    'listeners must be registered once, not stacked on every remount'
  );
  assert.ok(sent.length > 0, 'typing still broadcasts after the remount');

  // A third mount while the first is still attached must also be safe.
  const a = joinChatPresence(supabase, { ...options, onTypingChange: () => {} });
  const b = joinChatPresence(supabase, { ...options, onTypingChange: () => {} });
  assert.equal(broadcastListeners, 1, 'concurrent subscribers share one registration');
  void a.leave();
  void b.leave();

  console.log('  presence: same-chat remount reuses the channel, no presence callbacks');
}

reactions();
quotes();
typing();
presenceReuse();

/**
 * Notification policy: mirrors the recipient filter in notify_chat_message_v2().
 * If these diverge from the trigger, the UI explains a state the database does
 * not actually produce.
 */
function notificationPolicy() {
  const direct = { entity_type: null };
  const genreRoom = { entity_type: 'genre' };
  const on = {
    enable_push_notifications: true,
    enable_chat_notifications: true,
    enable_entity_chat_notifications: false,
  };

  // Direct chats notify by default; entity rooms do not.
  assert.equal(wouldNotify(on, direct, false), true);
  assert.equal(wouldNotify(on, genreRoom, false), false, 'entity rooms are opt-in');
  assert.equal(
    wouldNotify({ ...on, enable_entity_chat_notifications: true }, genreRoom, false),
    true
  );

  // Per-chat mute beats every setting.
  assert.equal(wouldNotify(on, direct, true), false);
  assert.equal(
    wouldNotify({ ...on, enable_entity_chat_notifications: true }, genreRoom, true),
    false
  );

  // Global chat switch beats the room opt-in.
  assert.equal(
    wouldNotify(
      { ...on, enable_chat_notifications: false, enable_entity_chat_notifications: true },
      genreRoom,
      false
    ),
    false
  );

  // Missing settings row must fall back to the documented defaults, not to
  // "notify everything" — entity rooms would spam on a fresh account.
  assert.equal(wouldNotify(null, direct, false), true);
  assert.equal(wouldNotify(null, genreRoom, false), false);
  assert.equal(wouldNotify({}, genreRoom, false), false);

  // Reasons are ordered most-specific first, so the message matches the cause.
  assert.equal(muteReason(on, direct, true), 'Muted');
  assert.equal(muteReason(on, genreRoom, false), 'Room notifications are off in Settings');
  assert.equal(
    muteReason({ ...on, enable_chat_notifications: false }, genreRoom, false),
    'Chat notifications are off in Settings'
  );
  assert.equal(muteReason(on, direct, false), null, 'no reason when it will notify');

  // Push off is not the same as silent: the bell entry is still created.
  assert.ok(
    (muteReason({ ...on, enable_push_notifications: false }, direct, false) ?? '').includes(
      'still see'
    )
  );

  console.log('  policy: mute > global chat > room opt-in, defaults safe');
}

notificationPolicy();
console.log('chatFeatures: all checks passed');
