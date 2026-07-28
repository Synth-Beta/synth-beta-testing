-- SAFE CHAT MIGRATION - Only adds chat functionality, doesn't break existing tables
-- This migration only adds new chat features without touching search tables or existing functionality

-- First, let's ensure all necessary columns exist and handle existing NULLs before setting NOT NULL constraints.

-- Add 'chat_name' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'chats' AND column_name = 'chat_name') THEN
        ALTER TABLE public.chats ADD COLUMN chat_name text;
    END IF;
END $$;

-- Add 'is_group_chat' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'chats' AND column_name = 'is_group_chat') THEN
        ALTER TABLE public.chats ADD COLUMN is_group_chat boolean DEFAULT false;
    END IF;
END $$;

-- Add 'users' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'chats' AND column_name = 'users') THEN
        ALTER TABLE public.chats ADD COLUMN users uuid[];
    END IF;
END $$;

-- Add 'latest_message_id' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'chats' AND column_name = 'latest_message_id') THEN
        ALTER TABLE public.chats ADD COLUMN latest_message_id uuid;
    END IF;
END $$;

-- Add 'group_admin_id' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'chats' AND column_name = 'group_admin_id') THEN
        ALTER TABLE public.chats ADD COLUMN group_admin_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Update existing rows to provide default non-NULL values for new columns
-- For 'chat_name': Set a default if NULL. We can use 'Direct Chat' as a placeholder.
UPDATE public.chats
SET chat_name = COALESCE(chat_name, 'Direct Chat')
WHERE chat_name IS NULL;

-- For 'is_group_chat': Set to false if NULL.
UPDATE public.chats
SET is_group_chat = COALESCE(is_group_chat, false)
WHERE is_group_chat IS NULL;

-- For 'users': Set to empty array for existing rows where it's NULL.
UPDATE public.chats
SET users = COALESCE(users, ARRAY[]::uuid[])
WHERE users IS NULL;

-- Now, set NOT NULL constraints for the columns
ALTER TABLE public.chats ALTER COLUMN chat_name SET NOT NULL;
ALTER TABLE public.chats ALTER COLUMN is_group_chat SET NOT NULL;
ALTER TABLE public.chats ALTER COLUMN users SET NOT NULL;

-- DON'T DROP match_id column - keep it for existing functionality
-- The old policies can coexist with new ones

-- Create the 'messages' table if it doesn't exist (from the simplified schema)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add RLS policies for the new 'chats' table (alongside existing ones)
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- New policy for authenticated users to view their chats using the users array
DROP POLICY IF EXISTS "Users can view chats using users array" ON public.chats;
CREATE POLICY "Users can view chats using users array"
ON public.chats FOR SELECT
TO authenticated
USING (auth.uid() = ANY(users));

-- New policy for authenticated users to insert new chats
DROP POLICY IF EXISTS "Users can create chats using users array" ON public.chats;
CREATE POLICY "Users can create chats using users array"
ON public.chats FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = ANY(users));

-- New policy for authenticated users to update their chats
DROP POLICY IF EXISTS "Users can update chats using users array" ON public.chats;
CREATE POLICY "Users can update chats using users array"
ON public.chats FOR UPDATE
TO authenticated
USING (auth.uid() = ANY(users))
WITH CHECK (auth.uid() = ANY(users));

-- New policy for authenticated users to delete their chats
DROP POLICY IF EXISTS "Users can delete chats using users array" ON public.chats;
CREATE POLICY "Users can delete chats using users array"
ON public.chats FOR DELETE
TO authenticated
USING (auth.uid() = ANY(users));

-- Add RLS policies for the new 'messages' table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view messages in their chats
DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages;
CREATE POLICY "Users can view messages in their chats"
ON public.messages FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.chats WHERE chats.id = messages.chat_id AND auth.uid() = ANY(chats.users)));

-- Policy for authenticated users to insert messages into their chats
DROP POLICY IF EXISTS "Users can send messages to their chats" ON public.messages;
CREATE POLICY "Users can send messages to their chats"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.chats WHERE chats.id = messages.chat_id AND auth.uid() = ANY(chats.users)) AND sender_id = auth.uid());

-- Policy for authenticated users to update their own messages
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
CREATE POLICY "Users can update their own messages"
ON public.messages FOR UPDATE
TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

-- Policy for authenticated users to delete their own messages
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
CREATE POLICY "Users can delete their own messages"
ON public.messages FOR DELETE
TO authenticated
USING (sender_id = auth.uid());

-- Create indexes for better performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_chats_users ON public.chats USING GIN(users);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- Create function to update chat latest_message_id
CREATE OR REPLACE FUNCTION public.update_chat_latest_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chats 
  SET latest_message_id = NEW.id, updated_at = now()
  WHERE id = NEW.chat_id;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS update_chat_latest_message_trigger ON public.messages;
CREATE TRIGGER update_chat_latest_message_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_latest_message();

-- Create function to create direct chat between two users
CREATE OR REPLACE FUNCTION public.create_direct_chat(user1_id uuid, user2_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chat_id uuid;
  existing_chat_id uuid;
BEGIN
  -- Check if direct chat already exists between these users
  SELECT id INTO existing_chat_id
  FROM public.chats
  WHERE is_group_chat = false 
    AND array_length(users, 1) = 2
    AND user1_id = ANY(users) 
    AND user2_id = ANY(users);
  
  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;
  
  -- Create new direct chat
  INSERT INTO public.chats (chat_name, is_group_chat, users)
  VALUES ('Direct Chat', false, ARRAY[user1_id, user2_id])
  RETURNING id INTO chat_id;
  
  RETURN chat_id;
END;
$$;

-- Create function to create group chat
CREATE OR REPLACE FUNCTION public.create_group_chat(chat_name text, user_ids uuid[], admin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chat_id uuid;
BEGIN
  -- Add admin to users array if not already included
  IF NOT (admin_id = ANY(user_ids)) THEN
    user_ids := array_append(user_ids, admin_id);
  END IF;
  
  -- Create group chat
  INSERT INTO public.chats (chat_name, is_group_chat, users, group_admin_id)
  VALUES (chat_name, true, user_ids, admin_id)
  RETURNING id INTO chat_id;
  
  RETURN chat_id;
END;
$$;

-- Create function to get user's chats with latest message
CREATE OR REPLACE FUNCTION public.get_user_chats(user_id uuid)
RETURNS TABLE (
  id uuid,
  chat_name text,
  is_group_chat boolean,
  users uuid[],
  latest_message_id uuid,
  latest_message text,
  latest_message_created_at timestamp with time zone,
  latest_message_sender_name text,
  group_admin_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
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
    m.message as latest_message,
    m.created_at as latest_message_created_at,
    p.name as latest_message_sender_name,
    c.group_admin_id,
    c.created_at,
    c.updated_at
  FROM public.chats c
  LEFT JOIN public.messages m ON m.id = c.latest_message_id
  LEFT JOIN public.profiles p ON p.user_id = m.sender_id
  WHERE user_id = ANY(c.users)
  ORDER BY c.updated_at DESC;
END;
$$;
