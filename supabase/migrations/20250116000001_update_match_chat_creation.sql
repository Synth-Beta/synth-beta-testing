-- Update the check_for_match function to create chats with users array
-- This ensures compatibility with the unified chat system

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
        INSERT INTO public.chats (match_id, chat_name, users, is_group_chat)
        VALUES (
          new_match_id,
          'Concert Buddy Chat',
          ARRAY[LEAST(NEW.swiper_user_id, NEW.swiped_user_id), GREATEST(NEW.swiper_user_id, NEW.swiped_user_id)],
          false
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update existing match-based chats to include users array if missing
UPDATE public.chats 
SET users = ARRAY[m.user1_id, m.user2_id],
    chat_name = COALESCE(chat_name, 'Concert Buddy Chat'),
    is_group_chat = COALESCE(is_group_chat, false)
FROM public.matches m 
WHERE chats.match_id = m.id 
AND (chats.users IS NULL OR array_length(chats.users, 1) IS NULL);
