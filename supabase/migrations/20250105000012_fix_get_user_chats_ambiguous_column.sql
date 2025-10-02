-- Fix ambiguous column reference in get_user_chats function
CREATE OR REPLACE FUNCTION "public"."get_user_chats"(
    "user_id" UUID
) RETURNS TABLE (
    "id" UUID,
    "chat_name" TEXT,
    "is_group_chat" BOOLEAN,
    "users" UUID[],
    "latest_message_id" UUID,
    "latest_message" TEXT,
    "latest_message_created_at" TIMESTAMPTZ,
    "latest_message_sender_name" TEXT,
    "group_admin_id" UUID,
    "created_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."get_user_chats" TO "anon", "authenticated";
