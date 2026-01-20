-- ============================================================
-- Fix get_or_create_verified_chat function to remove references to chats.users and chats.member_count
-- ============================================================
-- After migration 20260120000000_remove_chats_users_array_and_member_count.sql,
-- the chats table no longer has users or member_count columns.
-- This migration updates get_or_create_verified_chat to remove these references.

CREATE OR REPLACE FUNCTION public.get_or_create_verified_chat(
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_entity_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
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
  -- Optimize: Check UUID first if p_entity_id looks like a UUID, then fallback to text
  IF p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    -- Try UUID lookup first (uses index on entity_uuid)
    SELECT id INTO v_chat_id
    FROM public.chats
    WHERE entity_type = p_entity_type
      AND entity_uuid = p_entity_id::UUID
      AND is_verified = true
    LIMIT 1;
    
    -- If not found, try entity_id lookup
    IF v_chat_id IS NULL THEN
      SELECT id INTO v_chat_id
      FROM public.chats
      WHERE entity_type = p_entity_type
        AND entity_id = p_entity_id
        AND is_verified = true
      LIMIT 1;
    END IF;
  ELSE
    -- Not a UUID, use entity_id lookup (uses index on entity_type, entity_id)
    SELECT id INTO v_chat_id
    FROM public.chats
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND is_verified = true
    LIMIT 1;
  END IF;

  -- If chat exists, return it
  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- Generate chat name and resolve entity_uuid based on entity type
  IF p_entity_type = 'event' THEN
    -- Optimize: Check if p_entity_id is a UUID first
    IF p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      -- Direct UUID lookup (uses primary key index)
      SELECT id INTO v_entity_uuid
      FROM public.events
      WHERE id = p_entity_id::UUID
      LIMIT 1;
    ELSE
      -- Not a UUID, try text lookup (if events table has text ID column)
      -- For now, assume it's always UUID
      v_entity_uuid := NULL;
    END IF;
    
    -- For events, get details by joining with artists and venues tables
    -- IMPORTANT: Do NOT reference e.artist_name - it doesn't exist!
    -- Always join with artists table to get artist name
    IF v_entity_uuid IS NOT NULL THEN
      -- Use UUID lookup (fast, uses primary key)
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
      WHERE e.id = v_entity_uuid
      LIMIT 1;
    END IF;

    IF v_event_title IS NOT NULL THEN
      -- Use detailed name if available
      IF v_artist_name IS NOT NULL AND v_venue_name IS NOT NULL AND v_event_date IS NOT NULL THEN
        v_chat_name := v_artist_name || ' at ' || v_venue_name || ' - ' || TO_CHAR(v_event_date, 'Mon DD');
      ELSIF v_artist_name IS NOT NULL AND v_venue_name IS NOT NULL THEN
        v_chat_name := v_artist_name || ' at ' || v_venue_name;
      ELSE
        v_chat_name := v_event_title || ' Chat';
      END IF;
    ELSE
      v_chat_name := COALESCE(p_entity_name, 'Event') || ' Chat';
    END IF;

  ELSIF p_entity_type = 'artist' THEN
    -- Optimize: Check if p_entity_id is a UUID first
    IF p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      -- Direct UUID lookup (uses primary key index)
      SELECT id, name INTO v_entity_uuid, v_artist_name
      FROM public.artists
      WHERE id = p_entity_id::UUID
      LIMIT 1;
    ELSE
      -- Not a UUID, try identifier lookup (uses index on identifier if exists)
      SELECT id, name INTO v_entity_uuid, v_artist_name
      FROM public.artists
      WHERE identifier = p_entity_id
      LIMIT 1;
    END IF;

    v_chat_name := COALESCE(v_artist_name, p_entity_name, 'Artist') || ' Chat';

  ELSIF p_entity_type = 'venue' THEN
    -- Optimize: Check if p_entity_id is a UUID first
    IF p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      -- Direct UUID lookup (uses primary key index)
      SELECT id, name INTO v_entity_uuid, v_venue_name
      FROM public.venues
      WHERE id = p_entity_id::UUID
      LIMIT 1;
    ELSE
      -- Not a UUID, try identifier lookup (uses index on identifier if exists)
      SELECT id, name INTO v_entity_uuid, v_venue_name
      FROM public.venues
      WHERE identifier = p_entity_id
      LIMIT 1;
    END IF;

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
  -- REMOVED: users and member_count columns (removed in migration 20260120000000)
  -- Users join via chat_participants table, member_count is computed on-demand
  -- Use exception handling to gracefully handle race conditions
  BEGIN
    INSERT INTO public.chats (
      chat_name,
      is_group_chat,
      entity_type,
      entity_id,
      entity_uuid,
      is_verified,
      group_admin_id,
      created_at,
      updated_at
    )
    VALUES (
      v_chat_name,
      true,
      p_entity_type,
      p_entity_id,
      v_entity_uuid, -- UUID reference for FK relationships
      true,
      NULL, -- No admin for verified chats (public)
      NOW(),
      NOW()
    )
    RETURNING id INTO v_chat_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Chat already exists (race condition), fetch it
      -- Optimize: Try UUID first if available, then entity_id
      IF v_entity_uuid IS NOT NULL THEN
        SELECT id INTO v_chat_id
        FROM public.chats
        WHERE entity_type = p_entity_type
          AND entity_uuid = v_entity_uuid
          AND is_verified = true
        LIMIT 1;
      END IF;
      
      -- If not found, try entity_id lookup
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_or_create_verified_chat(TEXT, TEXT, TEXT) TO authenticated, anon;

-- Comment
COMMENT ON FUNCTION public.get_or_create_verified_chat IS 'Gets existing verified chat or creates a new one for the specified entity. Updated to remove references to chats.users and chats.member_count columns (removed in migration 20260120000000). Users join via chat_participants table, member_count is computed on-demand.';

