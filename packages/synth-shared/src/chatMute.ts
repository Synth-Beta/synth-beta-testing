/**
 * Per-chat notification mute.
 *
 * Stored on `chat_participants.notifications_muted` — that table already has
 * exactly one row per (user, chat), so muting needs no extra table and inherits
 * the participant RLS policies unchanged.
 *
 * The mute is enforced by `notify_chat_message_v2()` in the database, which is
 * the only place a chat notification is created. These helpers are for reading
 * and writing the flag from the UI.
 */

import type { SynthSupabaseClient } from './supabaseClientType';

/** Is this chat muted for this user? Defaults to false on any read failure. */
export async function isChatMuted(
  supabase: SynthSupabaseClient,
  chatId: string,
  userId: string
): Promise<boolean> {
  if (!chatId || !userId) return false;

  const { data, error } = await supabase
    .from('chat_participants')
    .select('notifications_muted')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // 42703 = column missing, i.e. migration 04 not applied yet. Not an error
    // worth shouting about — the feature is simply not live.
    if (error.code !== '42703') console.warn('[chatMute] isChatMuted', error.message);
    return false;
  }

  return Boolean(data?.notifications_muted);
}

/**
 * Mute or unmute one chat. Returns whether the write landed, so the caller can
 * roll back an optimistic toggle rather than showing a state the server rejected.
 */
export async function setChatMuted(
  supabase: SynthSupabaseClient,
  chatId: string,
  userId: string,
  muted: boolean
): Promise<{ ok: boolean; error: string | null }> {
  if (!chatId || !userId) return { ok: false, error: 'missing_ids' };

  // UPDATE rather than upsert: the participant row must already exist. Creating
  // one here would silently add someone to a chat they are not in.
  const { error } = await supabase
    .from('chat_participants')
    .update({ notifications_muted: muted })
    .eq('chat_id', chatId)
    .eq('user_id', userId);

  if (error) {
    console.error('[chatMute] setChatMuted', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

/** Muted chat ids for a user, for rendering mute badges in a chat list. */
export async function fetchMutedChatIds(
  supabase: SynthSupabaseClient,
  userId: string
): Promise<Set<string>> {
  if (!userId) return new Set();

  const { data, error } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', userId)
    .eq('notifications_muted', true);

  if (error) {
    if (error.code !== '42703') console.warn('[chatMute] fetchMutedChatIds', error.message);
    return new Set();
  }

  return new Set((data || []).map((row: { chat_id: string }) => row.chat_id));
}
