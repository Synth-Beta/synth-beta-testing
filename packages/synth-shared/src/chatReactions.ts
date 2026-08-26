/**
 * Emoji reactions on chat messages — shared by web and mobile.
 *
 * Backed by the `message_reactions` table (see
 * supabase/chat-parity-2026-08-25/02_message_reactions.sql). A row per
 * (message, user, emoji), so two people reacting at once cannot clobber each
 * other and re-tapping is a delete rather than a duplicate.
 *
 * Realtime subscription filters on `chat_id`, which the table denormalises
 * precisely because postgres_changes accepts only one filter column.
 */

import type { SynthSupabaseClient } from './supabaseClientType';

/** Offered in the reaction picker on both platforms. */
export const DEFAULT_REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👍'] as const;

export interface MessageReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

/** One emoji bubble under a message: which emoji, how many, did I react. */
export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
}

/** message_id -> summaries, in a stable order for rendering. */
export type ReactionsByMessage = Map<string, ReactionSummary[]>;

/**
 * Groups raw rows into per-message summaries.
 * Pure — the one piece of real logic here, and the one worth testing.
 */
export function summarizeReactions(
  rows: MessageReactionRow[],
  currentUserId: string
): ReactionsByMessage {
  const byMessage = new Map<string, Map<string, ReactionSummary>>();

  for (const row of rows) {
    if (!row?.message_id || !row.emoji) continue;

    let forMessage = byMessage.get(row.message_id);
    if (!forMessage) {
      forMessage = new Map<string, ReactionSummary>();
      byMessage.set(row.message_id, forMessage);
    }

    const existing = forMessage.get(row.emoji);
    if (existing) {
      // The table's primary key prevents a genuine duplicate, but a realtime
      // INSERT can race the initial fetch and deliver the same row twice.
      if (existing.userIds.includes(row.user_id)) continue;
      existing.count += 1;
      existing.userIds.push(row.user_id);
      existing.reactedByMe ||= row.user_id === currentUserId;
    } else {
      forMessage.set(row.emoji, {
        emoji: row.emoji,
        count: 1,
        reactedByMe: row.user_id === currentUserId,
        userIds: [row.user_id],
      });
    }
  }

  const result: ReactionsByMessage = new Map();
  for (const [messageId, forMessage] of byMessage) {
    // Most-reacted first, then alphabetical so the order does not jitter between
    // renders when counts tie.
    const summaries = [...forMessage.values()].sort(
      (a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)
    );
    result.set(messageId, summaries);
  }
  return result;
}

/** Postgres: relation does not exist. Means migration 02 has not been applied. */
const UNDEFINED_TABLE = '42P01';

/**
 * Whether `message_reactions` exists. Set false on the first 42P01 so we stop
 * opening a realtime channel against a missing table, which otherwise errors
 * and retries for the life of the session.
 */
let reactionsTableAvailable: boolean | null = null;

/** Test seam — resets the probe so a suite can exercise both branches. */
export function __resetReactionsTableProbe(): void {
  reactionsTableAvailable = null;
}

export interface ChatReactionsDeps {
  supabase: SynthSupabaseClient;
}

export function createChatReactions({ supabase }: ChatReactionsDeps) {
  /** All reactions for a page of messages, ready to render. */
  async function fetchReactions(
    messageIds: string[],
    currentUserId: string
  ): Promise<ReactionsByMessage> {
    if (!messageIds.length) return new Map();

    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds);

    if (error) {
      // A missing table means the migration has not been applied yet. Reactions
      // are additive, so degrade to "no reactions" rather than breaking the thread.
      if (error.code === UNDEFINED_TABLE) {
        if (reactionsTableAvailable !== false) {
          console.warn(
            'message_reactions missing — apply supabase/chat-parity-2026-08-25/02_message_reactions.sql to enable reactions'
          );
        }
        reactionsTableAvailable = false;
      } else {
        console.error('Error fetching reactions:', error);
      }
      return new Map();
    }

    reactionsTableAvailable = true;
    return summarizeReactions((data || []) as MessageReactionRow[], currentUserId);
  }

  /**
   * Adds the reaction, or removes it if this user already reacted with this emoji.
   * Returns the resulting state so the caller can update optimistically.
   */
  async function toggleReaction(
    messageId: string,
    chatId: string,
    userId: string,
    emoji: string
  ): Promise<{ reacted: boolean; error: any }> {
    const { data: existing, error: selectError } = await supabase
      .from('message_reactions')
      .select('message_id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .maybeSingle();

    if (selectError) return { reacted: false, error: selectError };

    if (existing) {
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji);
      return { reacted: false, error };
    }

    // chat_id is overwritten by a BEFORE INSERT trigger from the message's real
    // chat; sending it here only satisfies the NOT NULL constraint.
    const { error } = await supabase
      .from('message_reactions')
      .insert({ message_id: messageId, chat_id: chatId, user_id: userId, emoji });

    return { reacted: !error, error };
  }

  /**
   * Live reaction updates for one chat. Returns an unsubscribe function.
   * `onChange` fires after any insert or delete; the caller refetches.
   */
  function subscribeToReactions(chatId: string, onChange: () => void): () => void {
    // Subscribing to a table that does not exist leaves the channel erroring and
    // retrying for the whole session. Skip it until the migration is applied.
    if (reactionsTableAvailable === false) return () => {};

    const channel = supabase
      .channel(`chat-reactions-${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: `chat_id=eq.${chatId}` },
        () => onChange()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }

  return { fetchReactions, toggleReaction, subscribeToReactions };
}

export type ChatReactions = ReturnType<typeof createChatReactions>;
