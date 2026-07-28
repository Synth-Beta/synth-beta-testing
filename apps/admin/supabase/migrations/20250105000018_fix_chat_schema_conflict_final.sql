-- Fix chat schema conflict by supporting both match-based and direct chats
-- This migration adds support for direct chats while maintaining match-based chats

-- First, let's check if the chats table has the users column
-- If not, add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chats' 
        AND column_name = 'users' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.chats ADD COLUMN users UUID[];
        ALTER TABLE public.chats ADD COLUMN chat_name TEXT;
        ALTER TABLE public.chats ADD COLUMN is_group_chat BOOLEAN DEFAULT false;
        ALTER TABLE public.chats ADD COLUMN group_admin_id UUID;
        ALTER TABLE public.chats ADD COLUMN latest_message_id UUID;
    END IF;
END $$;

-- Update existing match-based chats to include users array
UPDATE public.chats 
SET users = ARRAY[m.user1_id, m.user2_id]
FROM public.matches m 
WHERE chats.match_id = m.id 
AND chats.users IS NULL;

-- Make match_id nullable to support direct chats
ALTER TABLE public.chats ALTER COLUMN match_id DROP NOT NULL;

-- Update RLS policies to support both schemas
DROP POLICY IF EXISTS "Users can view chats they're part of" ON public.chats;
CREATE POLICY "Users can view chats they're part of" ON public.chats FOR SELECT USING (
  -- Support match-based chats
  EXISTS (
    SELECT 1 FROM matches 
    WHERE matches.id = chats.match_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
  OR
  -- Support direct chats with users array
  (chats.users IS NOT NULL AND auth.uid() = ANY(chats.users))
);

-- Update message policies to support both schemas
DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages;
CREATE POLICY "Users can view messages in their chats" ON public.messages FOR SELECT USING (
  -- Support match-based chats
  EXISTS (
    SELECT 1 FROM chats 
    JOIN matches ON matches.id = chats.match_id 
    WHERE chats.id = messages.chat_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
  OR
  -- Support direct chats with users array
  EXISTS (
    SELECT 1 FROM chats 
    WHERE chats.id = messages.chat_id 
    AND chats.users IS NOT NULL 
    AND auth.uid() = ANY(chats.users)
  )
);

DROP POLICY IF EXISTS "Users can send messages in their chats" ON public.messages;
CREATE POLICY "Users can send messages in their chats" ON public.messages FOR INSERT WITH CHECK (
  -- Support match-based chats
  EXISTS (
    SELECT 1 FROM chats 
    JOIN matches ON matches.id = chats.match_id 
    WHERE chats.id = messages.chat_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
  OR
  -- Support direct chats with users array
  EXISTS (
    SELECT 1 FROM chats 
    WHERE chats.id = messages.chat_id 
    AND chats.users IS NOT NULL 
    AND auth.uid() = ANY(chats.users)
  )
);

-- Ensure the create_direct_chat function works with the current schema
CREATE OR REPLACE FUNCTION public.create_direct_chat(user1_id uuid, user2_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_chat_id UUID;
    new_chat_id UUID;
BEGIN
    -- Check if chat already exists (using users array)
    SELECT id INTO existing_chat_id
    FROM chats
    WHERE users @> ARRAY[user1_id, user2_id]
    AND array_length(users, 1) = 2
    AND is_group_chat = false;
    
    IF existing_chat_id IS NOT NULL THEN
        RETURN existing_chat_id;
    END IF;
    
    -- Create new direct chat
    INSERT INTO chats (chat_name, is_group_chat, users, match_id)
    VALUES ('Direct Chat', false, ARRAY[user1_id, user2_id], NULL)
    RETURNING id INTO new_chat_id;
    
    RETURN new_chat_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_direct_chat TO "anon", "authenticated";
