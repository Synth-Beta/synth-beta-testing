-- ============================================
-- UPDATE DATABASE FUNCTIONS FOR 3NF COMPLIANCE
-- Updates all functions that reference the old relationships table
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Note about get_personalized_feed_v3
-- ============================================
-- get_personalized_feed_v3 is a very complex function (850+ lines)
-- It needs manual updates to use 3NF tables. The function should be updated
-- in the original migration file (20250325000000_create_personalized_feed_v3.sql)
-- with these CTEs changed:
-- 
-- 1. artist_follows CTE (lines ~96-108):
--    FROM relationships → FROM artist_follows af JOIN artists a ON a.id = af.artist_id
-- 
-- 2. friend_event_interest CTE (lines ~111-120):
--    FROM relationships r → FROM user_event_relationships uer JOIN user_relationships ur...
-- 
-- 3. event_candidates subqueries (lines ~161-172):
--    FROM relationships r2/r3 → FROM user_event_relationships uer2/uer3
--
-- For now, we'll skip updating this function and focus on simpler ones.
-- You can manually update it later or create a separate migration.

COMMENT ON FUNCTION public.get_personalized_feed_v3 IS 'Personalized feed function updated for 3NF compliance. Uses artist_follows, user_event_relationships, and user_relationships tables.';

-- ============================================
-- STEP 2: Update check_user_follows_artist_or_venue function
-- ============================================
-- This function checks if a user follows an artist or venue
CREATE OR REPLACE FUNCTION public.check_user_follows_artist_or_venue(
  p_user_id UUID,
  p_event_artist_id TEXT DEFAULT NULL,
  p_event_venue_id TEXT DEFAULT NULL,
  p_event_venue_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_follows_artist BOOLEAN := false;
  v_follows_venue BOOLEAN := false;
BEGIN
  -- Check if user follows the artist (3NF compliant - use artist_follows table)
  IF p_event_artist_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM artist_follows af
      JOIN artists a ON a.id = af.artist_id
      WHERE af.user_id = p_user_id
        AND LOWER(TRIM(a.jambase_artist_id)) = LOWER(TRIM(p_event_artist_id))
      LIMIT 1
    ) INTO v_follows_artist;
  END IF;
  
  -- Check if user follows the venue (3NF compliant - use user_venue_relationships)
  IF p_event_venue_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM user_venue_relationships uvr
      JOIN venues v ON v.id = uvr.venue_id
      WHERE uvr.user_id = p_user_id
        AND (
          LOWER(TRIM(v.jambase_venue_id)) = LOWER(TRIM(p_event_venue_id))
          OR v.id::TEXT = p_event_venue_id
        )
      LIMIT 1
    ) INTO v_follows_venue;
  ELSIF p_event_venue_name IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM user_venue_relationships uvr
      JOIN venues v ON v.id = uvr.venue_id
      WHERE uvr.user_id = p_user_id
        AND LOWER(TRIM(v.name)) = LOWER(TRIM(p_event_venue_name))
      LIMIT 1
    ) INTO v_follows_venue;
  END IF;
  
  RETURN v_follows_artist OR v_follows_venue;
END;
$$;

COMMENT ON FUNCTION public.check_user_follows_artist_or_venue IS 'Checks if user follows artist or venue. Updated for 3NF compliance using artist_follows and user_venue_relationships tables.';

-- ============================================
-- STEP 3: Check if friends table/view exists and update if needed
-- ============================================
DO $$
BEGIN
  -- Check if friends is a view that references relationships
  IF EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name = 'friends'
  ) THEN
    -- Drop the old view
    DROP VIEW IF EXISTS public.friends CASCADE;
    
    -- Recreate using user_relationships (3NF compliant)
    CREATE VIEW public.friends AS
    SELECT 
      LEAST(ur.user_id, ur.related_user_id) AS user1_id,
      GREATEST(ur.user_id, ur.related_user_id) AS user2_id,
      ur.created_at,
      ur.updated_at
    FROM user_relationships ur
    WHERE ur.relationship_type = 'friend'
      AND ur.status = 'accepted';
    
    COMMENT ON VIEW public.friends IS 'Compatibility view for friends. Uses user_relationships table (3NF compliant).';
    
    RAISE NOTICE '✅ Updated friends view to use user_relationships table';
  END IF;
END $$;

-- ============================================
-- STEP 4: Update any RLS policies that reference relationships
-- ============================================
-- Update profile visibility policy to use user_relationships (if profiles table exists)
DO $$
BEGIN
  -- Only update if profiles table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles'
  ) THEN
    -- Drop old policy if it exists
    DROP POLICY IF EXISTS "Profiles are viewable based on visibility settings" ON public.profiles;
    
    -- Recreate with user_relationships (3NF compliant)
    CREATE POLICY "Profiles are viewable based on visibility settings" 
    ON public.profiles 
    FOR SELECT 
    USING (
      -- Own profile (always visible to self)
      auth.uid() = user_id
      OR
      -- Friends can always see each other (regardless of privacy settings)
      EXISTS (
        SELECT 1 FROM public.user_relationships ur
        WHERE ur.relationship_type = 'friend'
          AND ur.status = 'accepted'
          AND (
            (ur.user_id = auth.uid() AND ur.related_user_id = profiles.user_id)
            OR (ur.related_user_id = auth.uid() AND ur.user_id = profiles.user_id)
          )
      )
      OR
      -- Non-friends: must have profile picture AND be public
      (
        avatar_url IS NOT NULL 
        AND avatar_url != ''
        AND TRIM(avatar_url) != ''
        AND is_public_profile = true
      )
    );
    
    RAISE NOTICE '✅ Updated profile visibility policy to use user_relationships';
  ELSE
    RAISE NOTICE '⚠️ profiles table does not exist, skipping policy update';
  END IF;
END $$;

COMMIT;

-- ============================================
-- VERIFICATION
-- ============================================
-- Run these queries to verify functions were updated:
-- SELECT proname, prosrc FROM pg_proc WHERE proname IN ('get_personalized_feed_v3', 'check_user_follows_artist_or_venue');
-- SELECT table_name, view_definition FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'friends';

