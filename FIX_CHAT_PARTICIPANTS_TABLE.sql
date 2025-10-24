-- Fix create_event_group function to work with existing chat schema
-- The current chat system uses users array in chats table, not separate chat_participants table

-- Update the create_event_group function to work with existing schema
CREATE OR REPLACE FUNCTION public.create_event_group(
  p_event_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_is_public BOOLEAN DEFAULT true,
  p_max_members INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
  v_chat_id UUID;
BEGIN
  -- Create a chat for the group using existing chat schema
  INSERT INTO public.chats (
    chat_name,
    is_group_chat,
    users,
    group_admin_id,
    created_at,
    updated_at
  ) VALUES (
    p_name || ' Group Chat',
    true,
    ARRAY[auth.uid()],
    auth.uid(),
    now(),
    now()
  )
  RETURNING id INTO v_chat_id;
  
  -- Create the group
  INSERT INTO public.event_groups (
    event_id,
    name,
    description,
    created_by_user_id,
    is_public,
    max_members,
    chat_id,
    member_count
  ) VALUES (
    p_event_id,
    p_name,
    p_description,
    auth.uid(),
    p_is_public,
    p_max_members,
    v_chat_id,
    1
  )
  RETURNING id INTO v_group_id;
  
  -- Add creator as admin member
  INSERT INTO public.event_group_members (
    group_id,
    user_id,
    role
  ) VALUES (
    v_group_id,
    auth.uid(),
    'admin'
  );
  
  RETURN v_group_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_event_group(UUID, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;
