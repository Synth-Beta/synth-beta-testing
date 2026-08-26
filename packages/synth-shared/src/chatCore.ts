/**
 * Chat data layer — single implementation for web and mobile.
 *
 * Replaces the two parallel services (`src/services/chatService.ts` and
 * `mobile/src/services/chatService.ts`) that queried the same tables with slightly
 * different logic. Where they disagreed, this keeps the better behaviour from each:
 *
 * - message-type-aware list previews ("Photo", "Shared an event")  — was mobile only
 * - `entity_type` / `group_admin_id` / participant ids on chat rows — was web only
 * - opaque-preview guard for undecryptable content                  — was mobile only
 * - `event_shares` fallback when `shared_event_id` is null          — both, duplicated
 * - a row limit on message history                                  — was mobile only
 *
 * Supabase and the crypto binding are injected, because each app builds its own.
 */

import type { SynthSupabaseClient } from './supabaseClientType';
import type { ChatCrypto } from './chatCrypto';

export const CHAT_SENDER_NAME_FALLBACK = 'Unknown';

/** Default history window. Web previously loaded every message in a chat with no cap. */
export const DEFAULT_MESSAGE_LIMIT = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChatMessageType = 'text' | 'event_share' | 'review_share' | 'system' | 'image';

export type ChatAuthorType = 'human' | 'ai_scene_guide' | 'system';

export interface ChatSenderProfile {
  name: string;
  avatar_url: string | null;
  bio: string | null;
  account_type: string | null;
}

/** The quoted message shown above a reply. Decrypted and truncated for display. */
export interface QuotedMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  preview: string;
  message_type: ChatMessageType;
}

export interface SharedChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  /** Decrypted and display-ready. Image rows read '[Image]', never raw ciphertext. */
  content: string;
  is_encrypted: boolean;
  created_at: string;
  sender_name: string;
  sender_avatar: string | null;
  message_type: ChatMessageType;
  shared_event_id: string | null;
  shared_review_id: string | null;
  metadata: Record<string, unknown> | null;
  /** Null unless this message replies to another. Requires migration 01. */
  reply_to_id: string | null;
  /** Resolved quote for `reply_to_id`. Null if the quoted message was deleted. */
  reply_to: QuotedMessage | null;
  author_type?: ChatAuthorType | null;
  persona_id?: string | null;
  plan_id?: string | null;
  cited_fact_ids?: string[] | null;
  contains_setlist_spoiler?: boolean | null;
}

export interface SharedUserChat {
  id: string;
  /** Raw `chats.chat_name`. Use `display_name` for anything user-facing. */
  chat_name: string;
  /** Peer name for direct chats, group name for groups, never a bare UUID. */
  display_name: string;
  is_group_chat: boolean;
  users: string[];
  latest_message_id: string | null;
  latest_message: string | null;
  latest_message_created_at: string | null;
  latest_message_sender_name: string | null;
  group_admin_id: string | null;
  entity_type: 'event' | 'artist' | 'venue' | 'genre' | null;
  entity_uuid: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Ciphertext or a bare id that leaked into a preview slot. Long unbroken strings and
 * raw UUIDs are never something a human typed.
 */
export function looksLikeOpaquePreview(text: string): boolean {
  const t = text.trim();
  if (t.length > 72 && !/\s/.test(t)) return true;
  return UUID_RE.test(t);
}

export function normalizeChatSenderProfile(row: {
  user_id: string;
  name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  account_type?: string | null;
}): ChatSenderProfile {
  const name = row.name?.trim() ?? '';
  const username = row.username?.trim() ?? '';
  return {
    name: name || username || CHAT_SENDER_NAME_FALLBACK,
    avatar_url: row.avatar_url ?? null,
    bio: row.bio ?? null,
    account_type: row.account_type ?? null,
  };
}

/** Message metadata can carry a display name for senders who have since left the chat. */
export function resolveSenderDisplayName(
  profile: { name?: string | null; username?: string | null } | undefined,
  metadata?: Record<string, unknown> | null
): string {
  const fromMeta =
    typeof metadata?.sender_display_name === 'string' ? metadata.sender_display_name.trim() : '';
  if (fromMeta) return fromMeta;

  const name = typeof profile?.name === 'string' ? profile.name.trim() : '';
  if (name) return name;

  const username = typeof profile?.username === 'string' ? profile.username.trim() : '';
  if (username) return username.startsWith('@') ? username : `@${username}`;

  return CHAT_SENDER_NAME_FALLBACK;
}

/** JSONB sometimes arrives as a string depending on the client. */
export function parseMessageMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function nonEmptyString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/** One-line summary for a chat list row. Never shows ciphertext. */
function previewForListRow(
  messageType: string | null | undefined,
  content: string | null | undefined,
  decrypted: string | null
): string {
  if (messageType === 'image') return 'Photo';
  if (messageType === 'event_share') return 'Shared an event';
  if (messageType === 'review_share') return 'Shared a review';

  const text = (decrypted ?? content ?? '').trim();
  if (!text) return 'No messages yet';
  if (looksLikeOpaquePreview(text)) return 'Message';
  return text;
}

const MESSAGE_COLUMNS =
  'id, chat_id, sender_id, content, is_encrypted, created_at, message_type, shared_event_id, shared_review_id, metadata';

/** Postgres: column does not exist. Means migration 01 has not been applied yet. */
const UNDEFINED_COLUMN = '42703';

/**
 * Whether `messages.reply_to_id` exists. Probed once on the first query and
 * remembered, so an unmigrated database costs one failed request per session
 * instead of breaking the thread outright.
 */
let replyColumnAvailable: boolean | null = null;

/** Test seam — resets the probe so a suite can exercise both branches. */
export function __resetReplyColumnProbe(): void {
  replyColumnAvailable = null;
}

/** One-line version of a message, for the quote bar above a reply. */
export function quotePreview(message: {
  content: string;
  message_type: ChatMessageType;
}): string {
  if (message.message_type === 'image') return 'Photo';
  if (message.message_type === 'event_share') return 'Shared an event';
  if (message.message_type === 'review_share') return 'Shared a review';
  const text = (message.content || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Message';
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
}

export interface ChatCoreDeps {
  supabase: SynthSupabaseClient;
  crypto: ChatCrypto;
}

export interface FetchUserChatsOptions {
  /** Hides artist/venue group chats from the list. Users stay joined either way. */
  hideEntityGroupChats?: boolean;
}

export function createChatCore(deps: ChatCoreDeps) {
  const { supabase, crypto } = deps;

  async function fetchChatSenderProfiles(
    chatId: string,
    senderIds: string[]
  ): Promise<Map<string, ChatSenderProfile>> {
    const map = new Map<string, ChatSenderProfile>();
    const unique = [...new Set(senderIds.filter(Boolean))];
    if (!unique.length || !chatId) return map;

    // SECURITY DEFINER RPC: lets participants read co-participant profiles without
    // opening up the users table. Falls back to a direct read for anyone it misses.
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_chat_sender_profiles', {
      p_chat_id: chatId,
      p_sender_ids: unique,
    });

    if (!rpcError && rpcData?.length) {
      for (const row of rpcData as Array<Parameters<typeof normalizeChatSenderProfile>[0]>) {
        map.set(row.user_id, normalizeChatSenderProfile(row));
      }
      if (map.size >= unique.length) return map;
    }

    const missing = unique.filter((id) => !map.has(id));
    if (!missing.length) return map;

    const { data: direct } = await supabase
      .from('users')
      .select('user_id, name, username, avatar_url, bio, account_type')
      .in('user_id', missing);

    for (const row of direct || []) map.set(row.user_id, normalizeChatSenderProfile(row));
    return map;
  }

  /** Header/list title: peer name for direct chats, group name for groups. */
  async function resolveChatDisplayName(
    chat: { id: string; chat_name: string | null; is_group_chat: boolean | null },
    userId: string,
    peerNameHint?: string
  ): Promise<string> {
    const title = (chat.chat_name || '').trim();

    if (chat.is_group_chat) return title || 'Group Chat';
    if (peerNameHint?.trim()) return peerNameHint.trim();

    const { data: parts } = await supabase
      .from('chat_participants')
      .select('user_id')
      .eq('chat_id', chat.id)
      .neq('user_id', userId)
      .limit(1);

    const otherUid = parts?.[0]?.user_id as string | undefined;
    if (otherUid) {
      const { data: userRow } = await supabase
        .from('users')
        .select('name, username')
        .eq('user_id', otherUid)
        .maybeSingle();
      const name = typeof userRow?.name === 'string' ? userRow.name.trim() : '';
      if (name) return name;
      const username = typeof userRow?.username === 'string' ? userRow.username.trim() : '';
      if (username) return `@${username}`;
    }

    // A raw UUID in chat_name is a data artefact, not a name worth showing.
    return title && !UUID_RE.test(title) ? title : 'Direct Chat';
  }

  async function fetchUserChats(
    userId: string,
    options: FetchUserChatsOptions = {}
  ): Promise<{ data: SharedUserChat[] | null; error: any }> {
    try {
      const { data: participants, error: participantsError } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', userId);

      if (participantsError) {
        if (
          participantsError.code === '42P17' ||
          participantsError.message?.includes('infinite recursion')
        ) {
          console.error(
            'RLS recursion in chat_participants – migration 20260120120201 (is_user_chat_participant SECURITY DEFINER) should prevent this.',
            participantsError
          );
        } else {
          console.error('Error fetching chat participants:', participantsError);
        }
        return { data: null, error: participantsError };
      }

      if (!participants?.length) return { data: [], error: null };

      const chatIds = participants.map((p: { chat_id: string }) => p.chat_id);

      const { data: chats, error: chatsError } = await supabase
        .from('chats')
        .select(
          `
          id,
          chat_name,
          is_group_chat,
          entity_type,
          entity_uuid,
          latest_message_id,
          group_admin_id,
          created_at,
          updated_at,
          messages!latest_message_id (
            id,
            content,
            is_encrypted,
            message_type,
            created_at,
            sender_id,
            users!messages_sender_id_fkey (
              user_id,
              name
            )
          )
        `
        )
        .in('id', chatIds)
        .order('updated_at', { ascending: false });

      if (chatsError) {
        console.error('Error fetching chats:', chatsError);
        return { data: null, error: chatsError };
      }

      const { data: allParticipants, error: allParticipantsError } = await supabase
        .from('chat_participants')
        .select('chat_id, user_id')
        .in('chat_id', chatIds);

      if (allParticipantsError) {
        console.error('Error fetching all participants:', allParticipantsError);
        return { data: null, error: allParticipantsError };
      }

      const participantsByChat = new Map<string, string[]>();
      for (const p of allParticipants || []) {
        const list = participantsByChat.get(p.chat_id) || [];
        list.push(p.user_id);
        participantsByChat.set(p.chat_id, list);
      }

      // Batch the peer lookup for direct chats — one query, not one per row.
      const list = chats || [];
      const peerNameByChat = new Map<string, string>();
      const directPeerIds = new Map<string, string>();
      for (const chat of list) {
        if (chat.is_group_chat) continue;
        const peer = (participantsByChat.get(chat.id) || []).find((id: string) => id !== userId);
        if (peer) directPeerIds.set(chat.id, peer);
      }
      if (directPeerIds.size > 0) {
        const { data: peers } = await supabase
          .from('users')
          .select('user_id, name, username')
          .in('user_id', [...new Set(directPeerIds.values())]);
        const nameById = new Map<string, string>();
        for (const u of peers || []) {
          const name =
            (typeof u.name === 'string' && u.name.trim()) ||
            (typeof u.username === 'string' && u.username.trim() ? `@${u.username.trim()}` : '');
          if (name) nameById.set(u.user_id, name);
        }
        for (const [chatId, peerId] of directPeerIds) {
          const name = nameById.get(peerId);
          if (name) peerNameByChat.set(chatId, name);
        }
      }

      const userChats = await Promise.all(
        list.map(async (chat: any) => {
          const latest = chat.messages as {
            content?: string;
            is_encrypted?: boolean;
            message_type?: string;
            created_at?: string;
            users?: { name?: string };
          } | null;

          let decrypted: string | null = null;
          if (latest?.is_encrypted && latest.content && latest.message_type !== 'image') {
            decrypted = await crypto.decryptChatMessage(
              { content: latest.content, chat_id: chat.id, is_encrypted: true },
              userId
            );
          }

          return {
            id: chat.id,
            chat_name: chat.chat_name,
            display_name: await resolveChatDisplayName(chat, userId, peerNameByChat.get(chat.id)),
            is_group_chat: !!chat.is_group_chat,
            users: participantsByChat.get(chat.id) || [],
            latest_message_id: chat.latest_message_id ?? null,
            latest_message: previewForListRow(latest?.message_type, latest?.content, decrypted),
            latest_message_created_at: latest?.created_at ?? null,
            latest_message_sender_name: latest?.users?.name ?? null,
            group_admin_id: chat.group_admin_id ?? null,
            entity_type: chat.entity_type ?? null,
            entity_uuid: chat.entity_uuid ?? null,
            created_at: chat.created_at,
            updated_at: chat.updated_at,
          } satisfies SharedUserChat;
        })
      );

      const filtered = options.hideEntityGroupChats
        ? userChats.filter(
            (c) => !(c.is_group_chat && (c.entity_type === 'artist' || c.entity_type === 'venue'))
          )
        : userChats;

      return { data: filtered, error: null };
    } catch (error) {
      console.error('Error in fetchUserChats:', error);
      return { data: null, error };
    }
  }

  /**
   * Fills in `reply_to` on every message that quotes another.
   *
   * Most quotes point at a message already in the fetched window, so those are
   * resolved in memory. Only quotes pointing further back — an old message
   * someone scrolled up to reply to — cost an extra query.
   */
  async function attachQuotedMessages(
    messages: SharedChatMessage[],
    chatId: string,
    userId: string,
    senderProfiles: Map<string, ChatSenderProfile>
  ): Promise<void> {
    const wanted = new Set(
      messages.map((m) => m.reply_to_id).filter((id): id is string => !!id)
    );
    if (!wanted.size) return;

    const quotes = new Map<string, QuotedMessage>();
    const inWindow = new Map(messages.map((m) => [m.id, m]));

    for (const id of wanted) {
      const found = inWindow.get(id);
      if (!found) continue;
      quotes.set(id, {
        id: found.id,
        sender_id: found.sender_id,
        sender_name: found.sender_name,
        preview: quotePreview(found),
        message_type: found.message_type,
      });
    }

    const missing = [...wanted].filter((id) => !quotes.has(id));
    if (missing.length) {
      // Scoped to this chat as well as the ids: RLS already blocks cross-chat
      // reads, but a quote must never resolve against another conversation even
      // if a policy is later loosened.
      const { data: older } = await supabase
        .from('messages')
        .select('id, sender_id, content, is_encrypted, message_type, metadata')
        .eq('chat_id', chatId)
        .in('id', missing);

      for (const row of (older || []) as any[]) {
        const metadata = parseMessageMetadata(row.metadata);
        const messageType: ChatMessageType =
          row.message_type === 'image'
            ? 'image'
            : row.message_type === 'event_share'
              ? 'event_share'
              : row.message_type === 'review_share'
                ? 'review_share'
                : row.message_type === 'system'
                  ? 'system'
                  : 'text';

        // Quotes of images never show ciphertext, and decryption is skipped for
        // them entirely — the preview is a fixed label.
        const content =
          messageType === 'image'
            ? ''
            : row.is_encrypted
              ? await crypto.decryptChatMessage(
                  { content: String(row.content ?? ''), chat_id: chatId, is_encrypted: true },
                  userId
                )
              : String(row.content ?? '');

        quotes.set(row.id, {
          id: row.id,
          sender_id: row.sender_id,
          sender_name: resolveSenderDisplayName(senderProfiles.get(row.sender_id), metadata),
          preview: quotePreview({ content, message_type: messageType }),
          message_type: messageType,
        });
      }
    }

    for (const message of messages) {
      // A quote whose target is gone stays null — the reply itself survives,
      // matching the ON DELETE SET NULL behaviour in migration 01.
      if (message.reply_to_id) message.reply_to = quotes.get(message.reply_to_id) ?? null;
    }
  }

  /**
   * Newest `limit` messages, returned oldest-first.
   * Ordering descending then reversing is deliberate: ascending + limit returns the
   * OLDEST rows, which is never what a chat thread wants.
   */
  async function fetchChatMessages(
    chatId: string,
    userId: string,
    limit: number = DEFAULT_MESSAGE_LIMIT
  ): Promise<{ data: SharedChatMessage[]; error: any }> {
    try {
      const selectRows = (withReply: boolean) =>
        supabase
          .from('messages')
          .select(withReply ? `${MESSAGE_COLUMNS}, reply_to_id` : MESSAGE_COLUMNS)
          .eq('chat_id', chatId)
          .order('created_at', { ascending: false })
          .limit(limit);

      // Try the reply column unless a previous call proved it absent.
      let { data, error } = await selectRows(replyColumnAvailable !== false);

      if (error?.code === UNDEFINED_COLUMN && replyColumnAvailable !== false) {
        // Migration 01 not applied. Fall back permanently for this session so the
        // thread still loads — replies simply do not exist yet.
        console.warn(
          'messages.reply_to_id missing — apply supabase/chat-parity-2026-08-25/01_message_reply_to.sql to enable replies'
        );
        replyColumnAvailable = false;
        ({ data, error } = await selectRows(false));
      } else if (!error) {
        replyColumnAvailable = replyColumnAvailable ?? true;
      }

      if (error) {
        console.error('Error fetching messages:', error);
        return { data: [], error };
      }

      const rows: any[] = ((data as any[]) || []).slice().reverse();
      if (!rows.length) return { data: [], error: null };

      const senderIds: string[] = [...new Set(rows.map((m) => String(m.sender_id)))];
      const messageIds: string[] = rows.map((m) => String(m.id));

      // Older event shares recorded the event only in `event_shares`, not on the message.
      const [sharesResult, senderProfiles] = await Promise.all([
        supabase
          .from('event_shares')
          .select('message_id, event_id')
          .eq('chat_id', chatId)
          .in('message_id', messageIds),
        fetchChatSenderProfiles(chatId, senderIds),
      ]);

      const eventIdByMessage = new Map<string, string>(
        (sharesResult.data || []).map((s: { message_id: string; event_id: string }) => [
          s.message_id,
          s.event_id,
        ])
      );

      const messages = await Promise.all(
        rows.map(async (msg: any) => {
          const metadata = parseMessageMetadata(msg.metadata);
          const rawType: string | null = msg.message_type ?? null;
          const isEncryptedRow = Boolean(msg.is_encrypted);

          const eventId =
            nonEmptyString(msg.shared_event_id) ??
            nonEmptyString(metadata?.event_id) ??
            eventIdByMessage.get(msg.id) ??
            null;
          const reviewId =
            nonEmptyString(msg.shared_review_id) ?? nonEmptyString(metadata?.review_id);

          // `message_type` is null on plain text rows — nothing ever writes 'text'.
          let messageType: ChatMessageType;
          if (rawType === 'system') messageType = 'system';
          else if (rawType === 'image') messageType = 'image';
          else if (rawType === 'review_share' || reviewId) messageType = 'review_share';
          else if (rawType === 'event_share' || eventId) messageType = 'event_share';
          else messageType = 'text';

          let content = typeof msg.content === 'string' ? msg.content : '';
          if (messageType === 'image') {
            // Image rows keep a storage path in metadata; content is not display text.
            content = '[Image]';
          } else if (isEncryptedRow) {
            content = await crypto.decryptChatMessage(
              { content, chat_id: chatId, is_encrypted: true },
              userId
            );
          } else if (looksLikeOpaquePreview(content)) {
            content = 'Message';
          }

          return {
            id: msg.id,
            chat_id: msg.chat_id ?? chatId,
            sender_id: msg.sender_id,
            content,
            is_encrypted: isEncryptedRow,
            created_at: msg.created_at,
            sender_name: resolveSenderDisplayName(senderProfiles.get(msg.sender_id), metadata),
            sender_avatar: senderProfiles.get(msg.sender_id)?.avatar_url ?? null,
            message_type: messageType,
            shared_event_id: messageType === 'event_share' ? eventId : null,
            shared_review_id: messageType === 'review_share' ? reviewId : null,
            // Fold the resolved event id back in so renderers reading metadata agree.
            metadata:
              eventId && metadata ? { ...metadata, event_id: eventId } : (metadata ?? (eventId ? { event_id: eventId } : null)),
            reply_to_id: nonEmptyString(msg.reply_to_id),
            reply_to: null,
          } satisfies SharedChatMessage;
        })
      );

      await attachQuotedMessages(messages, chatId, userId, senderProfiles);
      return { data: messages, error: null };
    } catch (error) {
      console.error('Error fetching messages:', error);
      return { data: [], error };
    }
  }

  /**
   * Encrypts, inserts, and bumps the chat so list ordering stays correct.
   * Encryption failure is fatal here on purpose — sending plaintext to a table
   * everyone reads as ciphertext is worse than a failed send.
   */
  async function sendChatMessage(
    chatId: string,
    senderId: string,
    content: string,
    extra?: Partial<{
      message_type: ChatMessageType;
      shared_event_id: string | null;
      shared_review_id: string | null;
      metadata: Record<string, unknown> | null;
      /** Message being replied to. Silently dropped if migration 01 is not applied. */
      reply_to_id: string | null;
    }>
  ): Promise<{ data: any; error: any }> {
    if (!content || typeof content !== 'string') {
      return { data: null, error: new Error('Message content must be a non-empty string') };
    }
    if (!chatId || typeof chatId !== 'string') {
      return { data: null, error: new Error('ChatId must be a non-empty string') };
    }
    if (!senderId || typeof senderId !== 'string') {
      return { data: null, error: new Error('SenderId must be a non-empty string') };
    }

    try {
      const encrypted = await crypto.encryptMessage(content, chatId, senderId);

      const { reply_to_id: replyToId, ...rest } = extra ?? {};
      const baseRow = {
        chat_id: chatId,
        sender_id: senderId,
        content: encrypted,
        is_encrypted: true,
        ...rest,
      };

      const insert = (withReply: boolean) =>
        supabase
          .from('messages')
          .insert(withReply ? { ...baseRow, reply_to_id: replyToId } : baseRow)
          .select()
          .single();

      const wantsReply = !!replyToId && replyColumnAvailable !== false;
      let { data, error } = await insert(wantsReply);

      if (error?.code === UNDEFINED_COLUMN && wantsReply) {
        // Migration 01 not applied — send the message anyway, without the quote.
        // Losing the reply link beats losing the message.
        console.warn(
          'messages.reply_to_id missing — sending without reply link; apply supabase/chat-parity-2026-08-25/01_message_reply_to.sql'
        );
        replyColumnAvailable = false;
        ({ data, error } = await insert(false));
      }

      if (error) {
        console.error('Error sending message:', error);
        return { data: null, error };
      }

      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

      return { data, error: null };
    } catch (error) {
      console.error('Error encrypting/sending message:', error);
      return { data: null, error };
    }
  }

  async function leaveChat(chatId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('chat_id', chatId)
      .eq('user_id', userId);
    if (error) console.error('Error leaving chat:', error);
    return !error;
  }

  return {
    fetchUserChats,
    fetchChatMessages,
    sendChatMessage,
    fetchChatSenderProfiles,
    resolveChatDisplayName,
    leaveChat,
  };
}

export type ChatCore = ReturnType<typeof createChatCore>;
