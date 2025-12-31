-- ============================================================
-- MIGRATION: Backfill Passport Entries from Existing Reviews
-- Processes reviews where event_id is null but venue_id/artist_id are populated
-- 
-- NOTE: This migration depends on 20250130000001_fix_passport_trigger_for_null_event_id.sql
-- which must be run first to update unlock_passport_venue and unlock_passport_artist functions
-- ============================================================

-- Drop existing function if it exists (needed because return type changed)
DROP FUNCTION IF EXISTS public.backfill_passport_from_reviews();

-- Ensure we have the latest versions of unlock functions (from migration 20250130000001)
-- If those functions don't exist with the correct signature, this will fail gracefully
DO $$
BEGIN
  -- Check if unlock_passport_venue exists with correct signature
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'unlock_passport_venue'
      AND pg_get_function_arguments(p.oid) = 'p_user_id uuid, p_venue_id text, p_venue_name text'
  ) THEN
    RAISE EXCEPTION 'Function unlock_passport_venue(UUID, TEXT, TEXT) not found. Please run migration 20250130000001_fix_passport_trigger_for_null_event_id.sql first.';
  END IF;
  
  -- Check if unlock_passport_artist exists with correct signature
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'unlock_passport_artist'
      AND pg_get_function_arguments(p.oid) = 'p_user_id uuid, p_artist_id text, p_artist_name text'
  ) THEN
    RAISE EXCEPTION 'Function unlock_passport_artist(UUID, TEXT, TEXT) not found. Please run migration 20250130000001_fix_passport_trigger_for_null_event_id.sql first.';
  END IF;
END $$;

-- Backfill function to process reviews with event_id = null
CREATE OR REPLACE FUNCTION public.backfill_passport_from_reviews()
RETURNS TABLE(
  processed_count INTEGER,
  venues_unlocked INTEGER,
  artists_unlocked INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_review RECORD;
  v_venue_data RECORD;
  v_artist_data RECORD;
  v_venue_name TEXT;
  v_artist_name TEXT;
  v_identifier TEXT;
  v_processed INTEGER := 0;
  v_venues INTEGER := 0;
  v_artists INTEGER := 0;
BEGIN
  -- Process all non-draft reviews where event_id is null but venue_id or artist_id is not null
  FOR v_review IN
    SELECT 
      r.id,
      r.user_id,
      r.venue_id,
      r.artist_id,
      r.created_at
    FROM public.reviews r
    WHERE r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND r.event_id IS NULL
      AND (r.venue_id IS NOT NULL OR r.artist_id IS NOT NULL)
    ORDER BY r.created_at ASC
  LOOP
    v_processed := v_processed + 1;
    
    -- Get venue data from venues table
    IF v_review.venue_id IS NOT NULL THEN
      SELECT 
        v.name,
        v.identifier
      INTO v_venue_data
      FROM public.venues v
      WHERE v.id = v_review.venue_id;
      
      IF v_venue_data IS NOT NULL THEN
        v_venue_name := v_venue_data.name;
        v_identifier := v_venue_data.identifier;
        
        -- Unlock venue
        IF v_venue_name IS NOT NULL THEN
          PERFORM public.unlock_passport_venue(
            v_review.user_id,
            COALESCE(v_identifier, v_review.venue_id::TEXT),
            v_venue_name
          );
          v_venues := v_venues + 1;
        END IF;
      END IF;
    END IF;
    
    -- Get artist data
    IF v_review.artist_id IS NOT NULL THEN
      SELECT 
        a.name,
        a.identifier
      INTO v_artist_data
      FROM public.artists a
      WHERE a.id = v_review.artist_id;
      
      IF v_artist_data IS NOT NULL THEN
        v_artist_name := v_artist_data.name;
        v_identifier := v_artist_data.identifier;
        
        -- Unlock artist
        IF v_artist_name IS NOT NULL THEN
          PERFORM public.unlock_passport_artist(
            v_review.user_id,
            COALESCE(v_identifier, v_review.artist_id::TEXT),
            v_artist_name
          );
          v_artists := v_artists + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_processed, v_venues, v_artists;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.backfill_passport_from_reviews TO authenticated;

-- Run the backfill
DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM public.backfill_passport_from_reviews();
  RAISE NOTICE 'Backfill complete: Processed % reviews, Unlocked % venues, % artists', 
    v_result.processed_count, 
    v_result.venues_unlocked, 
    v_result.artists_unlocked;
END $$;

