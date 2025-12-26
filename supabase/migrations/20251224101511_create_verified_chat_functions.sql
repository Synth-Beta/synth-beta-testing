-- Create functions for verified chat management
-- These functions handle getting/creating verified chats, joining, and retrieving chat info

-- Function 1: Get or create verified chat for an entity
CREATE OR REPLACE FUNCTION public.get_or_create_verified_chat(
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_entity_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id UUID;
  v_chat_name TEXT;
  v_event_title TEXT;
  v_artist_name TEXT;
  v_venue_name TEXT;
  v_event_date DATE;
  v_entity_uuid UUID;
BEGIN
  -- Validate entity_type
  IF p_entity_type NOT IN ('event', 'artist', 'venue') THEN
    RAISE EXCEPTION 'Invalid entity_type: %. Must be event, artist, or venue', p_entity_type;
  END IF;

  -- Try to get existing verified chat (check both entity_id and entity_uuid)
  SELECT id INTO v_chat_id
  FROM public.chats
  WHERE entity_type = p_entity_type
    AND (entity_id = p_entity_id OR entity_uuid::TEXT = p_entity_id)
    AND is_verified = true
  LIMIT 1;

  -- If chat exists, return it
  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- Generate chat name and resolve entity_uuid based on entity type
  IF p_entity_type = 'event' THEN
    -- Try UUID first, then text ID
    SELECT id INTO v_entity_uuid
    FROM public.events
    WHERE id::TEXT = p_entity_id OR (p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND id = p_entity_id::UUID)
    LIMIT 1;
    
    -- For events, try to get more details for better naming
    -- Join with artists and venues tables for 3NF compliance
    SELECT 
      e.title,
      a.name as artist_name,
      v.name as venue_name,
      e.event_date::DATE
    INTO 
      v_event_title,
      v_artist_name,
      v_venue_name,
      v_event_date
    FROM public.events e
    LEFT JOIN public.artists a ON e.artist_id = a.id
    LEFT JOIN public.venues v ON e.venue_id = v.id
    WHERE e.id::TEXT = p_entity_id OR (p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND e.id = p_entity_id::UUID)
    LIMIT 1;

    IF v_event_title IS NOT NULL THEN
      -- Use detailed name if available
      IF v_artist_name IS NOT NULL AND v_venue_name IS NOT NULL AND v_event_date IS NOT NULL THEN
        v_chat_name := v_artist_name || ' at ' || v_venue_name || ' - ' || TO_CHAR(v_event_date, 'Mon DD');
      ELSE
        v_chat_name := v_event_title || ' Chat';
      END IF;
    ELSE
      v_chat_name := COALESCE(p_entity_name, 'Event') || ' Chat';
    END IF;

  ELSIF p_entity_type = 'artist' THEN
    -- Try UUID first, then text ID
    SELECT id INTO v_entity_uuid
    FROM public.artists
    WHERE id::TEXT = p_entity_id 
       OR (p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND id = p_entity_id::UUID)
       OR jambase_artist_id = p_entity_id
    LIMIT 1;
    
    -- For artists, try to get name from database
    SELECT a.name INTO v_artist_name
    FROM public.artists a
    WHERE a.id::TEXT = p_entity_id 
       OR (p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND a.id = p_entity_id::UUID)
       OR a.jambase_artist_id = p_entity_id
    LIMIT 1;

    v_chat_name := COALESCE(v_artist_name, p_entity_name, 'Artist') || ' Chat';

  ELSIF p_entity_type = 'venue' THEN
    -- Try UUID first, then text ID
    SELECT id INTO v_entity_uuid
    FROM public.venues
    WHERE id::TEXT = p_entity_id 
       OR (p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND id = p_entity_id::UUID)
       OR jambase_venue_id = p_entity_id
    LIMIT 1;
    
    -- For venues, try to get name from database
    SELECT v.name INTO v_venue_name
    FROM public.venues v
    WHERE v.id::TEXT = p_entity_id 
       OR (p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND v.id = p_entity_id::UUID)
       OR v.jambase_venue_id = p_entity_id
    LIMIT 1;

    v_chat_name := COALESCE(v_venue_name, p_entity_name, 'Venue') || ' Chat';
  END IF;

  -- Validate entity_uuid exists in the correct table before inserting
  IF v_entity_uuid IS NOT NULL THEN
    IF p_entity_type = 'event' AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = v_entity_uuid) THEN
      RAISE EXCEPTION 'Entity UUID % does not exist in events table', v_entity_uuid;
    ELSIF p_entity_type = 'artist' AND NOT EXISTS (SELECT 1 FROM public.artists WHERE id = v_entity_uuid) THEN
      RAISE EXCEPTION 'Entity UUID % does not exist in artists table', v_entity_uuid;
    ELSIF p_entity_type = 'venue' AND NOT EXISTS (SELECT 1 FROM public.venues WHERE id = v_entity_uuid) THEN
      RAISE EXCEPTION 'Entity UUID % does not exist in venues table', v_entity_uuid;
    END IF;
  END IF;

  -- Create new verified chat
  -- Use exception handling to gracefully handle race conditions
  BEGIN
    INSERT INTO public.chats (
      chat_name,
      is_group_chat,
      users,
      entity_type,
      entity_id,
      entity_uuid,
      is_verified,
      member_count,
      group_admin_id,
      created_at,
      updated_at
    )
    VALUES (
      v_chat_name,
      true,
      ARRAY[]::UUID[],
      p_entity_type,
      p_entity_id,
      v_entity_uuid, -- UUID reference for FK relationships
      true,
      0,
      NULL, -- No admin for verified chats (public)
      NOW(),
      NOW()
    )
    RETURNING id INTO v_chat_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Chat already exists (race condition), fetch it
      SELECT id INTO v_chat_id
      FROM public.chats
      WHERE entity_type = p_entity_type
        AND (
          entity_id = p_entity_id
          OR (v_entity_uuid IS NOT NULL AND entity_uuid = v_entity_uuid)
        )
        AND is_verified = true
      LIMIT 1;
      
      -- If still not found, try broader search
      IF v_chat_id IS NULL THEN
        SELECT id INTO v_chat_id
        FROM public.chats
        WHERE entity_type = p_entity_type
          AND entity_id = p_entity_id
          AND is_verified = true
        LIMIT 1;
      END IF;
      
      -- If still not found, raise error
      IF v_chat_id IS NULL THEN
        RAISE EXCEPTION 'Unique constraint violation but could not find existing chat for entity_type=%, entity_id=%', p_entity_type, p_entity_id;
      END IF;
  END;

  RETURN v_chat_id;
END;
$$;

-- Function 2: Join verified chat (add user to chat)
CREATE OR REPLACE FUNCTION public.join_verified_chat(
  p_chat_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member BOOLEAN;
  v_new_users UUID[];
BEGIN
  -- Check if chat is verified
  IF NOT EXISTS (
    SELECT 1 FROM public.chats 
    WHERE id = p_chat_id AND is_verified = true
  ) THEN
    RAISE EXCEPTION 'Chat % is not a verified chat', p_chat_id;
  END IF;

  -- Check if user is already a member
  SELECT p_user_id = ANY(users) INTO v_is_member
  FROM public.chats
  WHERE id = p_chat_id;

  -- If already a member, just return chat_id
  IF v_is_member THEN
    RETURN p_chat_id;
  END IF;

  -- Add user to users array
  UPDATE public.chats
  SET 
    users = array_append(users, p_user_id),
    member_count = COALESCE(array_length(array_append(users, p_user_id), 1), 0),
    updated_at = NOW()
  WHERE id = p_chat_id
  RETURNING users INTO v_new_users;

  RETURN p_chat_id;
END;
$$;

-- Function 3: Get verified chat info (without creating)
CREATE OR REPLACE FUNCTION public.get_verified_chat_info(
  p_entity_type TEXT,
  p_entity_id TEXT
)
RETURNS TABLE (
  chat_id UUID,
  chat_name TEXT,
  member_count INTEGER,
  last_activity_at TIMESTAMPTZ,
  is_user_member BOOLEAN,
  current_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  -- Return chat info if exists (check both entity_id and entity_uuid)
  RETURN QUERY
  SELECT 
    c.id AS chat_id,
    c.chat_name,
    COALESCE(c.member_count, array_length(c.users, 1), 0) AS member_count,
    c.last_activity_at,
    (v_user_id IS NOT NULL AND v_user_id = ANY(c.users)) AS is_user_member,
    v_user_id AS current_user_id
  FROM public.chats c
  WHERE c.entity_type = p_entity_type
    AND (c.entity_id = p_entity_id OR c.entity_uuid::TEXT = p_entity_id)
    AND c.is_verified = true
  LIMIT 1;

  -- If no chat found, return NULL values
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      NULL::UUID AS chat_id,
      NULL::TEXT AS chat_name,
      NULL::INTEGER AS member_count,
      NULL::TIMESTAMPTZ AS last_activity_at,
      false AS is_user_member,
      v_user_id AS current_user_id;
  END IF;
END;
$$;

-- Function 4: Update last_activity_at when message is created (trigger helper)
CREATE OR REPLACE FUNCTION public.update_chat_last_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update last_activity_at for the chat
  UPDATE public.chats
  SET 
    last_activity_at = NEW.created_at,
    updated_at = NEW.created_at
  WHERE id = NEW.chat_id;

  RETURN NEW;
END;
$$;

-- Create trigger to update last_activity_at on message insert
DROP TRIGGER IF EXISTS trigger_update_chat_last_activity ON public.messages;

CREATE TRIGGER trigger_update_chat_last_activity
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_last_activity();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_verified_chat(TEXT, TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.join_verified_chat(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_verified_chat_info(TEXT, TEXT) TO authenticated, anon;

-- Add comments
COMMENT ON FUNCTION public.get_or_create_verified_chat IS 'Gets existing verified chat or creates a new one for the specified entity';
COMMENT ON FUNCTION public.join_verified_chat IS 'Adds a user to a verified chat if they are not already a member';
COMMENT ON FUNCTION public.get_verified_chat_info IS 'Returns verified chat information without creating a new chat';
COMMENT ON FUNCTION public.update_chat_last_activity IS 'Trigger function to update chat last_activity_at when messages are created';
