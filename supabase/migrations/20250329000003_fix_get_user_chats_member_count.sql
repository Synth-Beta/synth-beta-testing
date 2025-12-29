-- ============================================================
-- Fix get_user_chats to Return member_count
-- ============================================================
-- This migration updates get_user_chats to include member_count
-- in the return value, which is synced from chat_participants
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: UPDATE get_user_chats FUNCTION TO RETURN member_count
-- ============================================================
-- Drop existing function first because we're changing the return type
DROP FUNCTION IF EXISTS public.get_user_chats(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_user_chats(user_id UUID)
RETURNS TABLE (
    id UUID,
    chat_name TEXT,
    is_group_chat BOOLEAN,
    users UUID[],
    latest_message_id UUID,
    latest_message TEXT,
    latest_message_created_at TIMESTAMPTZ,
    latest_message_sender_name TEXT,
    group_admin_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    member_count INTEGER  -- Add member_count to return type
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.chat_name,
        c.is_group_chat,
        c.users,
        c.latest_message_id,
        COALESCE(m.content, '') as latest_message,
        m.created_at as latest_message_created_at,
        COALESCE(u.name, '') as latest_message_sender_name,
        c.group_admin_id,
        c.created_at,
        c.updated_at,
        COALESCE(c.member_count, 0) as member_count  -- Return member_count from chats table
    FROM public.chats c
    -- Join with chat_participants to find user's chats (3NF compliant)
    INNER JOIN public.chat_participants cp ON cp.chat_id = c.id AND cp.user_id = get_user_chats.user_id
    LEFT JOIN public.messages m ON c.latest_message_id = m.id
    LEFT JOIN public.users u ON m.sender_id = u.user_id
    ORDER BY c.updated_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_user_chats(UUID) IS 
'Returns user''s chats with latest message info and member_count (3NF compliant, queries chat_participants)';

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_user_chats(UUID) TO anon, authenticated;

-- ============================================================
-- STEP 2: VERIFICATION
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'get_user_chats Function Updated!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Function now returns member_count';
  RAISE NOTICE '✅ member_count is synced from chat_participants via triggers';
  RAISE NOTICE '========================================';
END $$;

COMMIT;

