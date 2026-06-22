-- Create passport_entries table for tracking user's cultural progress
-- Tracks cities visited, venues unlocked, artists seen, and scene participation

CREATE TABLE IF NOT EXISTS public.passport_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('city', 'venue', 'artist', 'scene')),
  entity_id TEXT, -- References the entity (city name, venue UUID, artist UUID, scene ID)
  entity_name TEXT NOT NULL, -- Denormalized for display
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional data (e.g., venue city, artist genres, scene description)
  
  -- Ensure one entry per user per entity
  UNIQUE(user_id, type, entity_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_passport_entries_user_id ON public.passport_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_passport_entries_type ON public.passport_entries(type);
CREATE INDEX IF NOT EXISTS idx_passport_entries_entity_id ON public.passport_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_passport_entries_unlocked_at ON public.passport_entries(unlocked_at DESC);

-- Enable RLS
ALTER TABLE public.passport_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop if exists to make idempotent)
DROP POLICY IF EXISTS "Users can view their own passport entries" ON public.passport_entries;
DROP POLICY IF EXISTS "Users can insert their own passport entries" ON public.passport_entries;
DROP POLICY IF EXISTS "Users can update their own passport entries" ON public.passport_entries;

CREATE POLICY "Users can view their own passport entries"
  ON public.passport_entries
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own passport entries"
  ON public.passport_entries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own passport entries"
  ON public.passport_entries
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to unlock city passport entry
CREATE OR REPLACE FUNCTION public.unlock_passport_city(
  p_user_id UUID,
  p_city_name TEXT,
  p_state TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id UUID;
  v_entity_id TEXT;
BEGIN
  -- Create entity_id from city and state
  v_entity_id := LOWER(COALESCE(p_city_name, '') || COALESCE('_' || p_state, ''));
  
  -- Insert or ignore if already exists
  INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
  VALUES (
    p_user_id,
    'city',
    v_entity_id,
    COALESCE(p_city_name, 'Unknown City'),
    jsonb_build_object('state', p_state)
  )
  ON CONFLICT (user_id, type, entity_id) DO NOTHING
  RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$;

-- Function to unlock venue passport entry
-- Updated to use JamBase venue_id (TEXT) instead of UUID
CREATE OR REPLACE FUNCTION public.unlock_passport_venue(
  p_user_id UUID,
  p_venue_id TEXT, -- Changed from UUID to TEXT for JamBase ID
  p_venue_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id UUID;
  v_entity_id TEXT;
BEGIN
  -- Use JamBase venue_id if available, otherwise use normalized venue name
  IF p_venue_id IS NOT NULL AND p_venue_id != '' THEN
    v_entity_id := p_venue_id; -- JamBase ID
  ELSE
    -- Use normalized venue name as entity_id when JamBase ID is null
    v_entity_id := LOWER(REPLACE(TRIM(COALESCE(p_venue_name, 'Unknown Venue')), ' ', '_'));
  END IF;
  
  -- Insert or ignore if already exists
  INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name)
  VALUES (
    p_user_id,
    'venue',
    v_entity_id,
    COALESCE(p_venue_name, 'Unknown Venue')
  )
  ON CONFLICT (user_id, type, entity_id) DO NOTHING
  RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$;

-- Function to unlock artist passport entry
CREATE OR REPLACE FUNCTION public.unlock_passport_artist(
  p_user_id UUID,
  p_artist_id TEXT,
  p_artist_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id UUID;
  v_entity_id TEXT;
BEGIN
  -- Use artist ID if available, otherwise use normalized artist name
  IF p_artist_id IS NOT NULL AND p_artist_id != '' THEN
    v_entity_id := p_artist_id;
  ELSE
    -- Use normalized artist name as entity_id when ID is null
    v_entity_id := LOWER(REPLACE(TRIM(COALESCE(p_artist_name, 'Unknown Artist')), ' ', '_'));
  END IF;
  
  -- Insert or ignore if already exists
  INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name)
  VALUES (
    p_user_id,
    'artist',
    v_entity_id,
    COALESCE(p_artist_name, 'Unknown Artist')
  )
  ON CONFLICT (user_id, type, entity_id) DO NOTHING
  RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$;

-- Function to unlock scene passport entry
CREATE OR REPLACE FUNCTION public.unlock_passport_scene(
  p_user_id UUID,
  p_scene_id TEXT,
  p_scene_name TEXT,
  p_scene_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  -- Insert or ignore if already exists
  INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
  VALUES (
    p_user_id,
    'scene',
    p_scene_id,
    p_scene_name,
    jsonb_build_object('description', p_scene_description)
  )
  ON CONFLICT (user_id, type, entity_id) DO NOTHING
  RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$;

-- Trigger function to auto-unlock passport entries on review submission
CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_data RECORD;
  v_venue_data RECORD;
BEGIN
  -- Only process if review is not a draft and user attended
  IF NEW.is_draft = false AND (NEW.was_there = true OR NEW.review_text IS NOT NULL) THEN
    -- Get event details - use JamBase IDs
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
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on reviews table
DROP TRIGGER IF EXISTS trigger_auto_unlock_passport_on_review ON public.reviews;
CREATE TRIGGER trigger_auto_unlock_passport_on_review
  AFTER INSERT OR UPDATE ON public.reviews
  FOR EACH ROW
  WHEN (NEW.is_draft = false)
  EXECUTE FUNCTION public.auto_unlock_passport_on_review();

-- Trigger function to auto-unlock passport entries on event interest
CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_interest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_data RECORD;
BEGIN
  -- Only process if user marked as interested
  IF NEW.relationship_type = 'interest' THEN
    -- Get event details - use JamBase IDs
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
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on user_event_relationships table
DROP TRIGGER IF EXISTS trigger_auto_unlock_passport_on_interest ON public.user_event_relationships;
CREATE TRIGGER trigger_auto_unlock_passport_on_interest
  AFTER INSERT ON public.user_event_relationships
  FOR EACH ROW
  WHEN (NEW.relationship_type = 'interest')
  EXECUTE FUNCTION public.auto_unlock_passport_on_interest();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.passport_entries TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_passport_city TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_passport_venue TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_passport_artist TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_passport_scene TO authenticated;

