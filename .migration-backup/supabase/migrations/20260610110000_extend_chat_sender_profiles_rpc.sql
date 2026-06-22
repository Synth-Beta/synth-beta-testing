-- Extend get_chat_sender_profiles with bio + account_type for participant modals.
-- Must DROP first: Postgres cannot change RETURNS TABLE shape via CREATE OR REPLACE.

BEGIN;

DROP FUNCTION IF EXISTS public.get_chat_sender_profiles(uuid, uuid[]);

CREATE FUNCTION public.get_chat_sender_profiles(
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

COMMIT;
