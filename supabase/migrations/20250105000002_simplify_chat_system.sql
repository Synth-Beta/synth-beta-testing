-- Drop existing chat tables if they exist
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_participants CASCADE;
DROP TABLE IF EXISTS public.chats CASCADE;

-- Create simplified chats table (similar to reference app)
CREATE TABLE public.chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_name text NOT NULL,
  is_group_chat boolean DEFAULT false,
  users uuid[] NOT NULL, -- Array of user IDs
  latest_message_id uuid,
  group_admin_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create messages table
CREATE TABLE public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create policies for chats
CREATE POLICY "Users can view chats they participate in" ON public.chats 
FOR SELECT USING (auth.uid() = ANY(users));

CREATE POLICY "Users can create chats" ON public.chats 
FOR INSERT WITH CHECK (auth.uid() = ANY(users));

CREATE POLICY "Users can update chats they participate in" ON public.chats 
FOR UPDATE USING (auth.uid() = ANY(users));

-- Create policies for messages
CREATE POLICY "Users can view messages in their chats" ON public.messages 
FOR SELECT USING (
  chat_id IN (
    SELECT id FROM public.chats WHERE auth.uid() = ANY(users)
  )
);

CREATE POLICY "Users can send messages in their chats" ON public.messages 
FOR INSERT WITH CHECK (
  chat_id IN (
    SELECT id FROM public.chats WHERE auth.uid() = ANY(users)
  )
);

-- Create indexes for better performance
CREATE INDEX idx_chats_users ON public.chats USING GIN(users);
CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

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

-- Create trigger to update latest message
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
