-- Fix the chat system with proper setup
-- First, drop any problematic tables and policies

DROP POLICY IF EXISTS "chat_participants_select" ON "public"."chat_participants";
DROP POLICY IF EXISTS "chat_participants_insert" ON "public"."chat_participants";
DROP POLICY IF EXISTS "chat_participants_update" ON "public"."chat_participants";
DROP POLICY IF EXISTS "chat_participants_delete" ON "public"."chat_participants";

DROP TABLE IF EXISTS "public"."chat_participants";

-- Simple chats table (if not exists)
CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "chat_name" TEXT DEFAULT 'Chat',
    "is_group_chat" BOOLEAN DEFAULT false,
    "users" UUID[] DEFAULT '{}',
    "latest_message_id" UUID,
    "group_admin_id" UUID,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Simple messages table
CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "chat_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies for chats
DROP POLICY IF EXISTS "chats_select_policy" ON "public"."chats";
CREATE POLICY "chats_select_policy" ON "public"."chats"
    FOR SELECT USING (auth.uid() = ANY(users));

DROP POLICY IF EXISTS "chats_insert_policy" ON "public"."chats";
CREATE POLICY "chats_insert_policy" ON "public"."chats"
    FOR INSERT WITH CHECK (auth.uid() = ANY(users));

DROP POLICY IF EXISTS "chats_update_policy" ON "public"."chats";
CREATE POLICY "chats_update_policy" ON "public"."chats"
    FOR UPDATE USING (auth.uid() = ANY(users));

DROP POLICY IF EXISTS "chats_delete_policy" ON "public"."chats";
CREATE POLICY "chats_delete_policy" ON "public"."chats"
    FOR DELETE USING (auth.uid() = ANY(users));

-- Simple RLS policies for messages
DROP POLICY IF EXISTS "messages_select_policy" ON "public"."messages";
CREATE POLICY "messages_select_policy" ON "public"."messages"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chats 
            WHERE chats.id = messages.chat_id 
            AND auth.uid() = ANY(chats.users)
        )
    );

DROP POLICY IF EXISTS "messages_insert_policy" ON "public"."messages";
CREATE POLICY "messages_insert_policy" ON "public"."messages"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chats 
            WHERE chats.id = messages.chat_id 
            AND auth.uid() = ANY(chats.users)
        )
    );

-- Simple RPC functions
CREATE OR REPLACE FUNCTION "public"."create_direct_chat"(
    "user1_id" UUID,
    "user2_id" UUID
) RETURNS UUID AS $$
DECLARE
    existing_chat_id UUID;
    new_chat_id UUID;
BEGIN
    -- Check if chat already exists
    SELECT id INTO existing_chat_id
    FROM chats
    WHERE NOT is_group_chat
    AND users @> ARRAY[user1_id, user2_id]
    AND array_length(users, 1) = 2;
    
    IF existing_chat_id IS NOT NULL THEN
        RETURN existing_chat_id;
    END IF;
    
    -- Create new chat
    INSERT INTO chats (chat_name, is_group_chat, users)
    VALUES ('Direct Chat', false, ARRAY[user1_id, user2_id])
    RETURNING id INTO new_chat_id;
    
    RETURN new_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION "public"."create_group_chat"(
    "chat_name" TEXT,
    "user_ids" UUID[],
    "admin_id" UUID
) RETURNS UUID AS $$
DECLARE
    new_chat_id UUID;
    all_users UUID[];
BEGIN
    -- Add admin to user list if not already there
    all_users := user_ids;
    IF NOT admin_id = ANY(all_users) THEN
        all_users := all_users || admin_id;
    END IF;
    
    -- Create group chat
    INSERT INTO chats (chat_name, is_group_chat, users, group_admin_id)
    VALUES (chat_name, true, all_users, admin_id)
    RETURNING id INTO new_chat_id;
    
    RETURN new_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION "public"."get_user_chats"(
    "user_id" UUID
) RETURNS TABLE(
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
    updated_at TIMESTAMPTZ
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
    WHERE user_id = ANY(c.users)
    ORDER BY c.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT ALL ON "public"."chats" TO "anon", "authenticated";
GRANT ALL ON "public"."messages" TO "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_direct_chat" TO "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_group_chat" TO "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_chats" TO "anon", "authenticated";
