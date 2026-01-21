-- ============================================
-- DIRECT FIX: Force refresh all bucket_list functions
-- ============================================
-- Run this directly in Supabase SQL Editor to fix the issue
-- ============================================

-- Step 1: Find what's still referencing bl.entity_type
SELECT 
    'FUNCTION' as object_type,
    routine_name,
    LEFT(routine_definition, 200) as definition_preview
FROM information_schema.routines
WHERE routine_definition LIKE '%bl.entity_type%'
  AND routine_schema = 'public';

-- Step 2: Drop and recreate all bucket_list related functions with correct schema
-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_notify_bucket_list_new_event ON public.events CASCADE;
DROP TRIGGER IF EXISTS trigger_update_preferences_on_bucket_list_add ON public.bucket_list CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.search_bucket_list(UUID, TEXT, INT) CASCADE;
DROP FUNCTION IF EXISTS public.notify_bucket_list_new_event() CASCADE;
DROP FUNCTION IF EXISTS public.update_preference_signals_on_bucket_list_add() CASCADE;
DROP FUNCTION IF EXISTS public.backfill_bucket_list_preference_signals() CASCADE;

-- Step 3: Recreate notify_bucket_list_new_event with correct schema
CREATE OR REPLACE FUNCTION public.notify_bucket_list_new_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket_list_user RECORD;
  v_artist_name TEXT;
  v_venue_name TEXT;
  v_event_title TEXT;
BEGIN
  SELECT COALESCE(NEW.title, 'New Event') INTO v_event_title;
  
  IF NEW.artist_id IS NOT NULL THEN
    SELECT name INTO v_artist_name
    FROM public.artists
    WHERE id = NEW.artist_id;
    
    IF v_artist_name IS NOT NULL THEN
      FOR v_bucket_list_user IN
        SELECT DISTINCT bl.user_id
        FROM public.bucket_list bl
        INNER JOIN public.entities e ON e.id = bl.entity_id
        WHERE e.entity_type = 'artist'
          AND e.entity_uuid = NEW.artist_id
      LOOP
        INSERT INTO public.notifications (
          user_id, type, title, message, data, is_read, created_at
        ) VALUES (
          v_bucket_list_user.user_id,
          'bucket_list_new_event',
          v_artist_name || ' has a new show!',
          v_event_title || 
            CASE 
              WHEN NEW.venue_id IS NOT NULL THEN
                ' at ' || COALESCE((SELECT name FROM public.venues WHERE id = NEW.venue_id), '')
              ELSE ''
            END ||
            ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
          jsonb_build_object(
            'event_id', NEW.id,
            'artist_id', NEW.artist_id,
            'artist_name', v_artist_name,
            'venue_id', NEW.venue_id,
            'venue_name', (SELECT name FROM public.venues WHERE id = NEW.venue_id),
            'event_title', v_event_title,
            'event_date', NEW.event_date,
            'entity_type', 'artist'
          ),
          false,
          now()
        );
      END LOOP;
    END IF;
  END IF;
  
  IF NEW.venue_id IS NOT NULL THEN
    SELECT name INTO v_venue_name
    FROM public.venues
    WHERE id = NEW.venue_id;
    
    IF v_venue_name IS NOT NULL THEN
      FOR v_bucket_list_user IN
        SELECT DISTINCT bl.user_id
        FROM public.bucket_list bl
        INNER JOIN public.entities e ON e.id = bl.entity_id
        WHERE e.entity_type = 'venue'
          AND e.entity_uuid = NEW.venue_id
      LOOP
        INSERT INTO public.notifications (
          user_id, type, title, message, data, is_read, created_at
        ) VALUES (
          v_bucket_list_user.user_id,
          'bucket_list_new_event',
          v_venue_name || ' has a new show!',
          v_event_title ||
            CASE 
              WHEN NEW.artist_id IS NOT NULL THEN
                ' with ' || COALESCE((SELECT name FROM public.artists WHERE id = NEW.artist_id), '')
              ELSE ''
            END ||
            ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
          jsonb_build_object(
            'event_id', NEW.id,
            'artist_id', NEW.artist_id,
            'artist_name', (SELECT name FROM public.artists WHERE id = NEW.artist_id),
            'venue_id', NEW.venue_id,
            'venue_name', v_venue_name,
            'event_title', v_event_title,
            'event_date', NEW.event_date,
            'entity_type', 'venue'
          ),
          false,
          now()
        );
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER trigger_notify_bucket_list_new_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_bucket_list_new_event();

-- Step 4: Fix calculate_bucket_list_starter function if it exists
-- This function is called during review insert and still has old references
DO $$
BEGIN
    -- Check if function exists and drop it
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'calculate_bucket_list_starter' 
        AND pronamespace = 'public'::regnamespace
    ) THEN
        DROP FUNCTION IF EXISTS public.calculate_bucket_list_starter(UUID) CASCADE;
    END IF;
END;
$$;

-- Recreate calculate_bucket_list_starter with correct schema
CREATE OR REPLACE FUNCTION public.calculate_bucket_list_starter(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket_list_count INTEGER;
BEGIN
  -- Count events where artist or venue is in user's bucket list
  SELECT COUNT(DISTINCT r.event_id)
  INTO v_bucket_list_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND r.is_draft = false
    AND (
      EXISTS (
        SELECT 1 FROM public.bucket_list bl
        INNER JOIN public.entities ent ON ent.id = bl.entity_id
        WHERE bl.user_id = p_user_id
          AND ent.entity_type = 'artist'
          AND ent.entity_uuid = e.artist_id
      )
      OR EXISTS (
        SELECT 1 FROM public.bucket_list bl
        INNER JOIN public.entities ent ON ent.id = bl.entity_id
        WHERE bl.user_id = p_user_id
          AND ent.entity_type = 'venue'
          AND ent.entity_uuid = e.venue_id
      )
    );
  
  RETURN COALESCE(v_bucket_list_count, 0);
END;
$$;

-- Step 5: Verify no more references to bl.entity_type
SELECT 
    'REMAINING REFERENCE' as status,
    routine_name,
    LEFT(routine_definition, 200) as definition_preview
FROM information_schema.routines
WHERE routine_definition LIKE '%bl.entity_type%'
  AND routine_schema = 'public';
