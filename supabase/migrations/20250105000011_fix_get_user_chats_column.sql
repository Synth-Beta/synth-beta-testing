-- Fix get_user_chats function to use correct column name and resolve ambiguous column reference
-- The messages table uses 'content' not 'message'
-- Fix ambiguous 'user_id' reference by using table alias

CREATE OR REPLACE FUNCTION public.get_user_chats(user_id uuid)
RETURNS TABLE (
    id uuid,
    chat_name text,
    is_group_chat boolean,
    users uuid[],
    latest_message_id uuid,
    latest_message text,
    latest_message_created_at timestamptz,
    latest_message_sender_name text,
    group_admin_id uuid,
    created_at timestamptz,
    updated_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.chat_name,
        c.is_group_chat,
        c.users,
        c.latest_message_id,
        m.content as latest_message,
        m.created_at as latest_message_created_at,
        p.name as latest_message_sender_name,
        c.group_admin_id,
        c.created_at,
        c.updated_at
    FROM chats c
    LEFT JOIN messages m ON c.latest_message_id = m.id
    LEFT JOIN profiles p ON m.sender_id = p.user_id
    WHERE get_user_chats.user_id = ANY(c.users)
    ORDER BY c.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_user_chats TO "anon", "authenticated";
