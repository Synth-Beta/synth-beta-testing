/**
 * Emoji reactions for the open chat thread.
 *
 * Requires supabase/chat-parity-2026-08-25/02_message_reactions.sql. Without it
 * the shared layer returns an empty map and this hook stays inert — the thread
 * still works, there are just no reactions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChatReactions, type ReactionsByMessage } from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';

export function useChatReactions(
  chatId: string | null | undefined,
  currentUserId: string,
  messageIds: string[]
) {
  const reactionsApi = useMemo(() => createChatReactions({ supabase }), []);
  const [reactions, setReactions] = useState<ReactionsByMessage>(new Map());

  // Keep the id list in a ref so the realtime subscription does not resubscribe
  // every time a message arrives.
  const messageIdsRef = useRef<string[]>(messageIds);
  messageIdsRef.current = messageIds;

  const key = messageIds.join(',');

  const refresh = useCallback(async () => {
    if (!messageIdsRef.current.length) {
      setReactions(new Map());
      return;
    }
    setReactions(await reactionsApi.fetchReactions(messageIdsRef.current, currentUserId));
  }, [reactionsApi, currentUserId]);

  // Refetch whenever the visible message set changes.
  useEffect(() => {
    void refresh();
  }, [key, refresh]);

  // Subscribe only after the first fetch has answered, so that a missing
  // message_reactions table is known before we open a channel against it —
  // otherwise the channel errors and retries for the whole session.
  useEffect(() => {
    if (!chatId) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void refresh().then(() => {
      if (cancelled) return;
      unsubscribe = reactionsApi.subscribeToReactions(chatId, () => void refresh());
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [chatId, reactionsApi, refresh]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!chatId) return;
      await reactionsApi.toggleReaction(messageId, chatId, currentUserId, emoji);
      // Refetch rather than patch locally: the realtime event confirms other
      // clients, and one small query is simpler than reconciling both paths.
      await refresh();
    },
    [chatId, currentUserId, reactionsApi, refresh]
  );

  return { reactions, toggleReaction };
}
