-- Fix event_id data type mismatch
-- Events table uses UUID but event_interests uses bigint

-- Drop and recreate event_interests with correct UUID type
DROP TABLE IF EXISTS public.event_interests CASCADE;

CREATE TABLE public.event_interests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- Enable RLS
ALTER TABLE public.event_interests ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view event interests" ON public.event_interests FOR SELECT USING (true);
CREATE POLICY "Users can create their own event interests" ON public.event_interests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own event interests" ON public.event_interests FOR DELETE USING (auth.uid() = user_id);

-- Also fix user_swipes and matches tables
DROP TABLE IF EXISTS public.user_swipes CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;

CREATE TABLE public.user_swipes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  swiper_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swiped_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  is_interested boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(swiper_user_id, swiped_user_id, event_id)
);

CREATE TABLE public.matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user1_id, user2_id, event_id)
);

-- Enable RLS for new tables
ALTER TABLE public.user_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Create policies for user_swipes
CREATE POLICY "Users can view swipes for events they're interested in" ON public.user_swipes FOR SELECT USING (
  auth.uid() = swiper_user_id OR 
  EXISTS (SELECT 1 FROM event_interests WHERE user_id = auth.uid() AND event_id = user_swipes.event_id)
);
CREATE POLICY "Users can create their own swipes" ON public.user_swipes FOR INSERT WITH CHECK (auth.uid() = swiper_user_id);

-- Create policies for matches
CREATE POLICY "Users can view their own matches" ON public.matches FOR SELECT USING (
  auth.uid() = user1_id OR auth.uid() = user2_id
);

-- Recreate the match detection trigger with correct data types
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
