-- Create chats table
CREATE TABLE IF NOT EXISTS public.chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text,
  type text NOT NULL CHECK (type IN ('direct', 'group')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_message_id uuid
);

-- Create chat_participants table
CREATE TABLE IF NOT EXISTS public.chat_participants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(chat_id, user_id)
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for chats
CREATE POLICY "Users can view chats they participate in" ON public.chats 
FOR SELECT USING (
  id IN (
    SELECT chat_id FROM public.chat_participants 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create chats" ON public.chats 
FOR INSERT WITH CHECK (true);

-- Create policies for chat_participants
CREATE POLICY "Users can view participants in their chats" ON public.chat_participants 
FOR SELECT USING (
  chat_id IN (
    SELECT chat_id FROM public.chat_participants 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can add participants to chats they're in" ON public.chat_participants 
FOR INSERT WITH CHECK (
  chat_id IN (
    SELECT chat_id FROM public.chat_participants 
    WHERE user_id = auth.uid()
  )
);

-- Create policies for chat_messages
CREATE POLICY "Users can view messages in their chats" ON public.chat_messages 
FOR SELECT USING (
  chat_id IN (
    SELECT chat_id FROM public.chat_participants 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can send messages in their chats" ON public.chat_messages 
FOR INSERT WITH CHECK (
  chat_id IN (
    SELECT chat_id FROM public.chat_participants 
    WHERE user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_id ON public.chat_participants(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON public.chat_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON public.chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Create function to update chat last_message_id
CREATE OR REPLACE FUNCTION public.update_chat_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chats 
  SET last_message_id = NEW.id, updated_at = now()
  WHERE id = NEW.chat_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger to update last message
CREATE TRIGGER update_chat_last_message_trigger
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_last_message();

-- Create function to get chat participants with profile info
CREATE OR REPLACE FUNCTION public.get_chat_participants(chat_id_param uuid)
RETURNS TABLE (
  user_id uuid,
  name text,
  avatar_url text,
  role text,
  joined_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cp.user_id,
    p.name,
    p.avatar_url,
    cp.role,
    cp.joined_at
  FROM public.chat_participants cp
  JOIN public.profiles p ON p.user_id = cp.user_id
  WHERE cp.chat_id = chat_id_param
  ORDER BY cp.joined_at ASC;
END;
$$;

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
  SELECT c.id INTO existing_chat_id
  FROM public.chats c
  JOIN public.chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = user1_id
  JOIN public.chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id = user2_id
  WHERE c.type = 'direct';
  
  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;
  
  -- Create new direct chat
  INSERT INTO public.chats (type, name)
  VALUES ('direct', '')
  RETURNING id INTO chat_id;
  
  -- Add participants
  INSERT INTO public.chat_participants (chat_id, user_id, role)
  VALUES 
    (chat_id, user1_id, 'member'),
    (chat_id, user2_id, 'member');
  
  RETURN chat_id;
END;
$$;
