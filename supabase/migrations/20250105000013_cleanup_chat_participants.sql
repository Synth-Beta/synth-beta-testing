-- Clean up chat_participants table and policies that are causing infinite recursion
-- The new chat system uses the users array in the chats table instead

-- Drop all policies on chat_participants first
DROP POLICY IF EXISTS "Users can view participants in their chats" ON public.chat_participants;
DROP POLICY IF EXISTS "Users can add participants to chats they're in" ON public.chat_participants;
DROP POLICY IF EXISTS "Users can update participants in their chats" ON public.chat_participants;
DROP POLICY IF EXISTS "Users can remove participants from their chats" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;

-- Drop the chat_participants table entirely
DROP TABLE IF EXISTS public.chat_participants;

-- Ensure messages table has proper RLS policies
-- Drop any existing policies first
DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their chats" ON public.messages;
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages;
DROP POLICY IF EXISTS "messages_update_policy" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_policy" ON public.messages;

-- Create simple policies for messages table
CREATE POLICY "messages_select_policy" ON public.messages
    FOR SELECT USING (
        chat_id IN (
            SELECT id FROM public.chats 
            WHERE auth.uid() = ANY(users)
        )
    );

CREATE POLICY "messages_insert_policy" ON public.messages
    FOR INSERT WITH CHECK (
        chat_id IN (
            SELECT id FROM public.chats 
            WHERE auth.uid() = ANY(users)
        )
    );

CREATE POLICY "messages_update_policy" ON public.messages
    FOR UPDATE USING (
        sender_id = auth.uid() AND
        chat_id IN (
            SELECT id FROM public.chats 
            WHERE auth.uid() = ANY(users)
        )
    );

CREATE POLICY "messages_delete_policy" ON public.messages
    FOR DELETE USING (
        sender_id = auth.uid() AND
        chat_id IN (
            SELECT id FROM public.chats 
            WHERE auth.uid() = ANY(users)
        )
    );
