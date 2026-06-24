-- ============================================================
-- Add helper to expose genre chat member counts to all users
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_genre_chat_member_counts()
RETURNS TABLE (
    entity_id TEXT,
    chat_id UUID,
    member_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM set_config('row_security', 'off', true);

    RETURN QUERY
    SELECT
        c.entity_id,
        c.id,
        COUNT(cp.user_id)::INT
    FROM public.chats c
    LEFT JOIN public.chat_participants cp ON cp.chat_id = c.id
    WHERE c.entity_type = 'genre'
    GROUP BY c.entity_id, c.id;
END;
$$;

COMMENT ON FUNCTION public.get_genre_chat_member_counts() IS
'Returns a row per genre chat with up-to-date member counts and bypasses RLS';

GRANT EXECUTE ON FUNCTION public.get_genre_chat_member_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_genre_chat_member_counts() TO authenticated;
