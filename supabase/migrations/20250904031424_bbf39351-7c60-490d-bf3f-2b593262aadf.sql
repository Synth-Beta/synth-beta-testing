-- Drop existing tables that have the wrong data types
DROP TABLE IF EXISTS public.chats CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.user_swipes CASCADE;
DROP TABLE IF EXISTS public.event_interests CASCADE;

-- Recreate event_interests with correct data types
CREATE TABLE public.event_interests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  event_id bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_interests ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view event interests" ON public.event_interests FOR SELECT USING (true);
CREATE POLICY "Users can create their own event interests" ON public.event_interests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own event interests" ON public.event_interests FOR DELETE USING (auth.uid() = user_id);

-- Recreate user_swipes with correct data types
CREATE TABLE public.user_swipes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  swiper_user_id uuid NOT NULL,
  swiped_user_id uuid NOT NULL,
  event_id bigint NOT NULL,
  is_interested boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(swiper_user_id, swiped_user_id, event_id)
);

-- Enable RLS
ALTER TABLE public.user_swipes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view swipes for events they're interested in" ON public.user_swipes FOR SELECT USING (
  auth.uid() = swiper_user_id OR 
  EXISTS (SELECT 1 FROM event_interests WHERE user_id = auth.uid() AND event_id = user_swipes.event_id)
);
CREATE POLICY "Users can create their own swipes" ON public.user_swipes FOR INSERT WITH CHECK (auth.uid() = swiper_user_id);

-- Recreate matches with correct data types
CREATE TABLE public.matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id uuid NOT NULL,
  user2_id uuid NOT NULL,
  event_id bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user1_id, user2_id, event_id)
);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own matches" ON public.matches FOR SELECT USING (
  auth.uid() = user1_id OR auth.uid() = user2_id
);

-- Recreate chats table
CREATE TABLE public.chats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view chats they're part of" ON public.chats FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM matches 
    WHERE matches.id = chats.match_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);

-- Recreate messages table
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view messages in their chats" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chats 
    JOIN matches ON matches.id = chats.match_id 
    WHERE chats.id = messages.chat_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);

CREATE POLICY "Users can send messages in their chats" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND 
  EXISTS (
    SELECT 1 FROM chats 
    JOIN matches ON matches.id = chats.match_id 
    WHERE chats.id = messages.chat_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);

-- Add trigger for updated_at on chats
CREATE TRIGGER update_chats_updated_at
  BEFORE UPDATE ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Recreate the match detection trigger
CREATE OR REPLACE FUNCTION public.check_for_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  match_exists BOOLEAN;
  new_match_id UUID;
BEGIN
  -- Only proceed if this is a positive swipe
  IF NEW.is_interested = true THEN
    -- Check if the other user has also swiped right
    SELECT EXISTS (
      SELECT 1 FROM public.user_swipes 
      WHERE swiper_user_id = NEW.swiped_user_id 
      AND swiped_user_id = NEW.swiper_user_id 
      AND event_id = NEW.event_id 
      AND is_interested = true
    ) INTO match_exists;
    
    IF match_exists THEN
      -- Create a match (ensure consistent ordering of user IDs)
      INSERT INTO public.matches (user1_id, user2_id, event_id)
      VALUES (
        LEAST(NEW.swiper_user_id, NEW.swiped_user_id),
        GREATEST(NEW.swiper_user_id, NEW.swiped_user_id),
        NEW.event_id
      )
      ON CONFLICT (user1_id, user2_id, event_id) DO NOTHING
      RETURNING id INTO new_match_id;
      
      -- Create a chat for the match if a new match was created
      IF new_match_id IS NOT NULL THEN
        INSERT INTO public.chats (match_id)
        VALUES (new_match_id);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add the trigger back
CREATE TRIGGER on_user_swipe_match_check
  AFTER INSERT ON public.user_swipes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_for_match();