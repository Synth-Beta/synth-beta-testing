-- Unread counts for every chat the signed-in user is in, in one query. Replaces one
-- COUNT request per chat on the web chat list.
-- SECURITY INVOKER (the default) on purpose: the same RLS as the queries it replaces.
--
-- ROLLBACK: DROP FUNCTION public.get_my_chat_unread_counts();

CREATE OR REPLACE FUNCTION public.get_my_chat_unread_counts()
RETURNS TABLE (chat_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.chat_id, count(m.id)
  FROM public.chat_participants p
  JOIN public.messages m
    ON m.chat_id = p.chat_id
   AND m.sender_id <> auth.uid()
   AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
  WHERE p.user_id = auth.uid()
  GROUP BY p.chat_id;
$$;

REVOKE ALL ON FUNCTION public.get_my_chat_unread_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_chat_unread_counts() TO authenticated;
