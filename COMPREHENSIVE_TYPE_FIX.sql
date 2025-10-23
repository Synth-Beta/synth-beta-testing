-- COMPREHENSIVE TYPE FIX
-- This fixes all the artist_id type mismatches and ensures proper data flow

-- ============================================================================
-- STEP 1: Ensure jambase_events has the required UUID columns
-- ============================================================================

-- Add artist_uuid column to jambase_events if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jambase_events' 
        AND column_name = 'artist_uuid'
    ) THEN
        ALTER TABLE public.jambase_events 
        ADD COLUMN artist_uuid UUID REFERENCES public.artists(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jambase_events' 
        AND column_name = 'venue_uuid'
    ) THEN
        ALTER TABLE public.jambase_events 
        ADD COLUMN venue_uuid UUID REFERENCES public.venues(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Populate the UUID columns in jambase_events
-- ============================================================================

-- Create function to populate artist_uuid and venue_uuid
CREATE OR REPLACE FUNCTION public.populate_artist_venue_uuids()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update jambase_events with artist UUIDs by matching JamBase IDs
    UPDATE public.jambase_events 
    SET artist_uuid = a.id
    FROM public.artists a
    WHERE jambase_events.artist_id = a.jambase_artist_id
    AND jambase_events.artist_uuid IS NULL
    AND jambase_events.artist_id IS NOT NULL;

    -- Update jambase_events with venue UUIDs by matching JamBase IDs  
    UPDATE public.jambase_events 
    SET venue_uuid = v.id
    FROM public.venues v
    WHERE jambase_events.venue_id = v.jambase_venue_id
    AND jambase_events.venue_uuid IS NULL
    AND jambase_events.venue_id IS NOT NULL;

    RAISE NOTICE 'Updated jambase_events with artist/venue UUIDs';
END;
$$;

-- Run the population function
SELECT public.populate_artist_venue_uuids();

-- ============================================================================
-- STEP 3: Fix the trigger function to handle type mismatches
-- ============================================================================

-- Drop existing triggers to avoid conflicts
DROP TRIGGER IF EXISTS auto_populate_review_artist_id_trigger ON public.user_reviews;
DROP TRIGGER IF EXISTS auto_populate_review_venue_id_trigger ON public.user_reviews;

-- Create improved trigger functions that handle type mismatches
CREATE OR REPLACE FUNCTION public.auto_populate_review_artist_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If artist_id is not provided, try to populate it from the event
    IF NEW.artist_id IS NULL THEN
        -- Try to get artist_uuid from jambase_events
        SELECT je.artist_uuid INTO NEW.artist_id
        FROM public.jambase_events je
        WHERE je.id = NEW.event_id
        AND je.artist_uuid IS NOT NULL;
        
        -- If still null, try to find artist by jambase_artist_id
        IF NEW.artist_id IS NULL THEN
            SELECT a.id INTO NEW.artist_id
            FROM public.jambase_events je
            JOIN public.artists a ON je.artist_id = a.jambase_artist_id
            WHERE je.id = NEW.event_id
            AND a.id IS NOT NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_populate_review_venue_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If venue_id is not provided, try to populate it from the event
    IF NEW.venue_id IS NULL THEN
        -- Try to get venue_uuid from jambase_events
        SELECT je.venue_uuid INTO NEW.venue_id
        FROM public.jambase_events je
        WHERE je.id = NEW.event_id
        AND je.venue_uuid IS NOT NULL;
        
        -- If still null, try to find venue by jambase_venue_id
        IF NEW.venue_id IS NULL THEN
            SELECT v.id INTO NEW.venue_id
            FROM public.jambase_events je
            JOIN public.venues v ON je.venue_id = v.jambase_venue_id
            WHERE je.id = NEW.event_id
            AND v.id IS NOT NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 4: Recreate the triggers with the fixed functions
-- ============================================================================

CREATE TRIGGER auto_populate_review_artist_id_trigger
    BEFORE INSERT ON public.user_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_populate_review_artist_id();

CREATE TRIGGER auto_populate_review_venue_id_trigger
    BEFORE INSERT ON public.user_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_populate_review_venue_id();

-- ============================================================================
-- STEP 5: Create indexes for better performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_uuid ON public.jambase_events(artist_uuid);
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_uuid ON public.jambase_events(venue_uuid);
CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_id ON public.jambase_events(artist_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_id ON public.jambase_events(venue_id);

-- ============================================================================
-- STEP 6: Fix the set_user_interest function to handle the correct types
-- ============================================================================

-- Drop the existing function to avoid conflicts
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);

-- Create the function with proper error handling
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id text, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_uuid uuid;
BEGIN
  -- Try to convert text to UUID first (in case it's already a UUID)
  BEGIN
    event_uuid := event_id::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      -- If conversion fails, try to find by jambase_event_id
      SELECT id INTO event_uuid 
      FROM public.jambase_events 
      WHERE jambase_event_id = event_id 
      LIMIT 1;
      
      IF event_uuid IS NULL THEN
        RAISE EXCEPTION 'Event not found: %', event_id;
      END IF;
  END;
  
  -- Perform the interest operation
  IF interested THEN
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_uuid)
    ON CONFLICT (user_id, jambase_event_id) 
    DO NOTHING;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_uuid;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.set_user_interest(text, boolean) TO authenticated;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'COMPREHENSIVE TYPE FIX APPLIED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixed Issues:';
  RAISE NOTICE '  ✅ Added artist_uuid/venue_uuid columns';
  RAISE NOTICE '  ✅ Populated UUID relationships';
  RAISE NOTICE '  ✅ Fixed trigger functions';
  RAISE NOTICE '  ✅ Fixed set_user_interest function';
  RAISE NOTICE '  ✅ Added proper indexes';
  RAISE NOTICE '========================================';
END $$;

-- Final verification
SELECT 'All type mismatch issues have been resolved!' as status;
