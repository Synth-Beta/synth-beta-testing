-- Add validation to create_group_chat function to ensure only regular users can be added
-- Artists (account_type='creator') and venues (account_type='business') are not allowed

CREATE OR REPLACE FUNCTION public.create_group_chat(chat_name text, user_ids uuid[], admin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_chat_id uuid;
  all_user_ids uuid[];
  participant_id uuid;
  invalid_user_id uuid;
BEGIN
  -- Ensure admin is included in user list
  all_user_ids := user_ids;
  IF NOT (admin_id = ANY(all_user_ids)) THEN
    all_user_ids := array_append(all_user_ids, admin_id);
  END IF;
  
  -- Validate all participants are regular users (not artists/venues)
  -- Allow 'user' and 'admin' account types, but not 'creator' or 'business'
  SELECT u.user_id INTO invalid_user_id
  FROM users u
  WHERE u.user_id = ANY(all_user_ids)
    AND u.account_type NOT IN ('user', 'admin')
  LIMIT 1;
  
  IF invalid_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Group chats can only include regular users. Artists and venues cannot be added to group chats.';
  END IF;
  
  -- Create group chat (no users column - uses chat_participants table per migration 20260120000000)
  INSERT INTO public.chats (chat_name, is_group_chat, group_admin_id)
  VALUES (chat_name, true, admin_id)
  RETURNING id INTO new_chat_id;
  
  -- Insert all users into chat_participants (3NF compliant, single source of truth)
  FOREACH participant_id IN ARRAY all_user_ids
  LOOP
    INSERT INTO public.chat_participants (chat_id, user_id, is_admin, joined_at)
    VALUES (
      new_chat_id, 
      participant_id, 
      (participant_id = admin_id),  -- Set is_admin = true for admin_id
      now()
    )
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  END LOOP;
  
  RETURN new_chat_id;
END;
$$;

COMMENT ON FUNCTION public.create_group_chat(text, uuid[], uuid) IS 
'Creates a group chat with specified users (3NF compliant, uses chat_participants). Only regular users (account_type=user or admin) can be added. Artists and venues are not allowed.';
