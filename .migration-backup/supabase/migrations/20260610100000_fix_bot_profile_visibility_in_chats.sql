-- Bot profiles were hidden by RESTRICTIVE RLS (is_bot = false only), so genre chat
-- messages showed "Unknown" for Maya, Jordan, etc. Keep bots out of discovery;
-- allow SELECT when the viewer shares a chat with the bot.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) users — allow bot profile reads for co-participants in the same chat
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Bot users hidden from client SELECT" ON public.users;

CREATE POLICY "Bot users hidden from client SELECT"
  ON public.users
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (
    COALESCE(is_bot, false) = false
    OR (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.chat_participants cp_self
        INNER JOIN public.chat_participants cp_peer
          ON cp_peer.chat_id = cp_self.chat_id
         AND cp_peer.user_id = users.user_id
        WHERE cp_self.user_id = auth.uid()
      )
    )
  );

COMMENT ON POLICY "Bot users hidden from client SELECT" ON public.users IS
  'Hide bot accounts from browse/search; expose name/avatar when viewer shares a chat (genre chats).';

-- ---------------------------------------------------------------------------
-- 2) RPC — chat-scoped sender profiles (SECURITY DEFINER, participant-gated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_chat_sender_profiles(
  p_chat_id uuid,
  p_sender_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  name text,
  username text,
  avatar_url text,
  bio text,
  account_type text,
  is_bot boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.user_id,
    u.name,
    u.username,
    u.avatar_url,
    u.bio,
    u.account_type,
    COALESCE(u.is_bot, false) AS is_bot
  FROM public.users u
  WHERE EXISTS (
    SELECT 1
    FROM public.chat_participants viewer
    WHERE viewer.chat_id = p_chat_id
      AND viewer.user_id = auth.uid()
  )
  AND (
    (p_sender_ids IS NOT NULL AND u.user_id = ANY(p_sender_ids))
    OR (
      p_sender_ids IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.chat_participants cp
        WHERE cp.chat_id = p_chat_id
          AND cp.user_id = u.user_id
      )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_sender_profiles(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_chat_sender_profiles(uuid, uuid[]) IS
  'Returns display fields for message senders / chat members. Caller must be a chat participant. Includes bots.';

-- Backfill sender_display_name on bot seed messages (client fallback before profile fetch).
UPDATE public.messages m
SET metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object('sender_display_name', u.name)
FROM public.users u
WHERE m.sender_id = u.user_id
  AND COALESCE(u.is_bot, false) = true
  AND COALESCE(m.metadata->>'bot_seed', 'false') = 'true'
  AND u.name IS NOT NULL
  AND length(trim(u.name)) > 0
  AND (
    m.metadata->>'sender_display_name' IS NULL
    OR length(trim(m.metadata->>'sender_display_name')) = 0
  );

COMMIT;
