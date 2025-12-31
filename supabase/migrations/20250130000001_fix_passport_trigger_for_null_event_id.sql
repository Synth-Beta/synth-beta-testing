-- ============================================================
-- MIGRATION: Fix Passport Trigger to Handle event_id = null
-- Updates trigger function to get city info from venues table
-- when event_id is null but venue_id/artist_id are populated
-- ============================================================

-- Drop existing functions with specific signatures to avoid ambiguity
DROP FUNCTION IF EXISTS public.unlock_passport_venue(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.unlock_passport_artist(UUID, TEXT, TEXT);

-- Update unlock_passport_venue to handle UUID venue_id
-- Uses entity_uuid for venues (per migration 20250328000009)
CREATE OR REPLACE FUNCTION public.unlock_passport_venue(
  p_user_id UUID,
  p_venue_id TEXT, -- Can be UUID string or identifier
  p_venue_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id UUID;
  v_entity_uuid UUID;
  v_entity_id TEXT;
BEGIN
  -- Try to parse as UUID and get identifier
  IF p_venue_id IS NOT NULL AND p_venue_id != '' THEN
    -- Check if it's a UUID format (has hyphens)
    IF p_venue_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      -- It's a UUID - use as entity_uuid and get identifier for entity_id
      v_entity_uuid := p_venue_id::UUID;
      SELECT identifier INTO v_entity_id
      FROM public.venues
      WHERE id = v_entity_uuid;
      
      -- If no identifier found, use UUID string as entity_id for metadata
      IF v_entity_id IS NULL OR v_entity_id = '' THEN
        v_entity_id := p_venue_id;
      END IF;
    ELSE
      -- Not a UUID - try to find venue by identifier
      SELECT id, identifier INTO v_entity_uuid, v_entity_id
      FROM public.venues
      WHERE identifier = p_venue_id
      LIMIT 1;
      
      -- If not found by identifier, use the ID as-is for entity_id (legacy support)
      IF v_entity_uuid IS NULL THEN
        v_entity_id := p_venue_id;
      END IF;
    END IF;
  ELSE
    -- No ID provided - use normalized venue name as entity_id (fallback)
    v_entity_id := LOWER(REPLACE(TRIM(COALESCE(p_venue_name, 'Unknown Venue')), ' ', '_'));
  END IF;
  
  -- Insert or ignore if already exists
  -- For venues: use entity_uuid (partial unique index - check exists first)
  IF v_entity_uuid IS NOT NULL THEN
    -- Check if entry already exists
    SELECT id INTO v_entry_id
    FROM public.passport_entries
    WHERE user_id = p_user_id
      AND type = 'venue'
      AND entity_uuid = v_entity_uuid;
    
    -- If doesn't exist, insert it
    IF v_entry_id IS NULL THEN
      INSERT INTO public.passport_entries (user_id, type, entity_uuid, entity_id, entity_name)
      VALUES (
        p_user_id,
        'venue',
        v_entity_uuid,
        v_entity_id,
        COALESCE(p_venue_name, 'Unknown Venue')
      )
      RETURNING id INTO v_entry_id;
    END IF;
  ELSE
    -- Fallback: if no UUID, can't use the partial index, so skip insert
    -- (This shouldn't happen in practice for venues)
    RETURN NULL;
  END IF;
  
  RETURN v_entry_id;
END;
$$;

-- Update unlock_passport_artist to handle UUID artist_id
-- Uses entity_uuid for artists (per migration 20250328000009)
CREATE OR REPLACE FUNCTION public.unlock_passport_artist(
  p_user_id UUID,
  p_artist_id TEXT, -- Can be UUID string or identifier
  p_artist_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id UUID;
  v_entity_uuid UUID;
  v_entity_id TEXT;
BEGIN
  -- Try to parse as UUID and get identifier
  IF p_artist_id IS NOT NULL AND p_artist_id != '' THEN
    -- Check if it's a UUID format (has hyphens)
    IF p_artist_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      -- It's a UUID - use as entity_uuid and get identifier for entity_id
      v_entity_uuid := p_artist_id::UUID;
      SELECT identifier INTO v_entity_id
      FROM public.artists
      WHERE id = v_entity_uuid;
      
      -- If no identifier found, use UUID string as entity_id for metadata
      IF v_entity_id IS NULL OR v_entity_id = '' THEN
        v_entity_id := p_artist_id;
      END IF;
    ELSE
      -- Not a UUID - try to find artist by identifier
      SELECT id, identifier INTO v_entity_uuid, v_entity_id
      FROM public.artists
      WHERE identifier = p_artist_id
      LIMIT 1;
      
      -- If not found by identifier, use the ID as-is for entity_id (legacy support)
      IF v_entity_uuid IS NULL THEN
        v_entity_id := p_artist_id;
      END IF;
    END IF;
  ELSE
    -- No ID provided - use normalized artist name as entity_id (fallback)
    v_entity_id := LOWER(REPLACE(TRIM(COALESCE(p_artist_name, 'Unknown Artist')), ' ', '_'));
  END IF;
  
  -- Insert or ignore if already exists
  -- For artists: use entity_uuid (partial unique index - check exists first)
  IF v_entity_uuid IS NOT NULL THEN
    -- Check if entry already exists
    SELECT id INTO v_entry_id
    FROM public.passport_entries
    WHERE user_id = p_user_id
      AND type = 'artist'
      AND entity_uuid = v_entity_uuid;
    
    -- If doesn't exist, insert it
    IF v_entry_id IS NULL THEN
      INSERT INTO public.passport_entries (user_id, type, entity_uuid, entity_id, entity_name)
      VALUES (
        p_user_id,
        'artist',
        v_entity_uuid,
        v_entity_id,
        COALESCE(p_artist_name, 'Unknown Artist')
      )
      RETURNING id INTO v_entry_id;
    END IF;
  ELSE
    -- Fallback: if no UUID, can't use the partial index, so skip insert
    -- (This shouldn't happen in practice for artists)
    RETURN NULL;
  END IF;
  
  RETURN v_entry_id;
END;
$$;

-- Update trigger function to handle event_id = null case
CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_data RECORD;
  v_venue_data RECORD;
  v_artist_data RECORD;
  v_venue_name TEXT;
  v_artist_name TEXT;
  v_jambase_venue_id TEXT;
  v_jambase_artist_id TEXT;
BEGIN
  -- Only process if review is not a draft and user attended
  IF NEW.is_draft = false AND (NEW.was_there = true OR NEW.review_text IS NOT NULL) THEN
    
    -- Case 1: event_id is not null - get data from events table
    IF NEW.event_id IS NOT NULL THEN
      SELECT 
        e.venue_city,
        e.venue_state,
        e.venue_id, -- JamBase venue ID (preferred)
        e.venue_name,
        e.artist_id, -- JamBase artist ID (preferred)
        e.artist_name
      INTO v_event_data
      FROM public.events e
      WHERE e.id = NEW.event_id;
      
      IF v_event_data IS NOT NULL THEN
        -- Unlock city (skip if "Unknown")
        IF v_event_data.venue_city IS NOT NULL 
           AND LOWER(TRIM(v_event_data.venue_city)) != 'unknown' THEN
          PERFORM public.unlock_passport_city(
            NEW.user_id,
            v_event_data.venue_city,
            v_event_data.venue_state
          );
        END IF;
        
        -- Unlock venue using JamBase venue_id
        IF v_event_data.venue_name IS NOT NULL THEN
          PERFORM public.unlock_passport_venue(
            NEW.user_id,
            v_event_data.venue_id, -- Use JamBase ID instead of UUID
            v_event_data.venue_name
          );
        END IF;
        
        -- Unlock artist using JamBase artist_id
        IF v_event_data.artist_name IS NOT NULL THEN
          PERFORM public.unlock_passport_artist(
            NEW.user_id,
            v_event_data.artist_id::TEXT, -- JamBase ID
            v_event_data.artist_name
          );
        END IF;
      END IF;
    
    -- Case 2: event_id is null - get data from venues and artists tables
    ELSIF NEW.venue_id IS NOT NULL OR NEW.artist_id IS NOT NULL THEN
      
      -- Get venue data from venues table
      IF NEW.venue_id IS NOT NULL THEN
        SELECT 
          v.name,
          v.identifier -- Use identifier instead of jambase_venue_id (doesn't exist in schema)
        INTO v_venue_data
        FROM public.venues v
        WHERE v.id = NEW.venue_id;
        
        IF v_venue_data IS NOT NULL THEN
          v_venue_name := v_venue_data.name;
          v_jambase_venue_id := v_venue_data.identifier; -- Use identifier as entity_id for venue
          
          -- Unlock venue
          IF v_venue_name IS NOT NULL THEN
            PERFORM public.unlock_passport_venue(
              NEW.user_id,
              COALESCE(v_jambase_venue_id, NEW.venue_id::TEXT),
              v_venue_name
            );
          END IF;
        END IF;
      END IF;
      
      -- Get artist data
      IF NEW.artist_id IS NOT NULL THEN
        SELECT 
          a.name,
          a.identifier
        INTO v_artist_data
        FROM public.artists a
        WHERE a.id = NEW.artist_id;
        
        IF v_artist_data IS NOT NULL THEN
          v_artist_name := v_artist_data.name;
          v_jambase_artist_id := v_artist_data.identifier;
          
          -- Unlock artist
          IF v_artist_name IS NOT NULL THEN
            PERFORM public.unlock_passport_artist(
              NEW.user_id,
              COALESCE(v_jambase_artist_id, NEW.artist_id::TEXT),
              v_artist_name
            );
          END IF;
        END IF;
      END IF;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Grant necessary permissions (specify full signature to avoid ambiguity)
GRANT EXECUTE ON FUNCTION public.unlock_passport_venue(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_passport_artist(UUID, TEXT, TEXT) TO authenticated;

