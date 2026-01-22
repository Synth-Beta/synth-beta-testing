-- ============================================================
-- Fix create_direct_chat function to add user validation
-- ============================================================
-- The function may be failing with 400 errors if users don't exist
-- or if there are constraint violations. This adds validation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_direct_chat(user1_id uuid, user2_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_chat_id uuid;
  new_chat_id uuid;
  user1_exists boolean;
  user2_exists boolean;
BEGIN
  -- Validate that both users exist
  SELECT EXISTS(SELECT 1 FROM public.users WHERE user_id = create_direct_chat.user1_id) INTO user1_exists;
  SELECT EXISTS(SELECT 1 FROM public.users WHERE user_id = create_direct_chat.user2_id) INTO user2_exists;
  
  IF NOT user1_exists THEN
    RAISE EXCEPTION 'User % does not exist', create_direct_chat.user1_id;
  END IF;
  
  IF NOT user2_exists THEN
    RAISE EXCEPTION 'User % does not exist', create_direct_chat.user2_id;
  END IF;
  
  -- Prevent creating chat with yourself
  IF user1_id = user2_id THEN
    RAISE EXCEPTION 'Cannot create direct chat with yourself';
  END IF;
  
  -- Check if direct chat already exists by querying chat_participants
  SELECT c.id INTO existing_chat_id
  FROM public.chats c
  WHERE c.is_group_chat = false
    AND EXISTS (
      SELECT 1 FROM public.chat_participants cp1
      WHERE cp1.chat_id = c.id AND cp1.user_id = user1_id
    )
    AND EXISTS (
      SELECT 1 FROM public.chat_participants cp2
      WHERE cp2.chat_id = c.id AND cp2.user_id = user2_id
    )
    AND (
      SELECT COUNT(*) FROM public.chat_participants cp
      WHERE cp.chat_id = c.id
    ) = 2  -- Only 2 participants for direct chat
  LIMIT 1;
  
  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;
  
  -- Create new direct chat (no users column - uses chat_participants table)
  INSERT INTO public.chats (chat_name, is_group_chat)
  VALUES ('Direct Chat', false)
  RETURNING id INTO new_chat_id;
  
  -- Insert both users into chat_participants (3NF compliant)
  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES 
    (new_chat_id, user1_id, now()),
    (new_chat_id, user2_id, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;
  
  RETURN new_chat_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise with more context
    RAISE EXCEPTION 'Error creating direct chat: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.create_direct_chat(uuid, uuid) IS 
'Creates or returns existing direct chat between two users (3NF compliant, uses chat_participants). Validates that both users exist before creating chat.';
