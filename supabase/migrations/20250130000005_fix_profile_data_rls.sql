-- Fix Profile Data RLS Policies
-- This migration fixes RLS policies that were preventing accurate display of
-- followers, friends, and review data when viewing other users' profiles

-- Step 1: Fix artist_follows RLS policy
-- Drop the restrictive policy that only allows users to see their own follows
DROP POLICY IF EXISTS "Users can view their own followed artists" ON public.artist_follows;

-- Create a new policy that allows authenticated users to view all artist follows
-- This is necessary for profile views to show accurate follower counts
CREATE POLICY "Authenticated users can view all artist follows"
ON public.artist_follows 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Keep existing policies for user's own records (only create if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'artist_follows' 
    AND policyname = 'Users can follow artists'
  ) THEN
    CREATE POLICY "Users can follow artists" 
    ON public.artist_follows 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'artist_follows' 
    AND policyname = 'Users can unfollow artists'
  ) THEN
    CREATE POLICY "Users can unfollow artists" 
    ON public.artist_follows 
    FOR DELETE 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Step 2: Fix venue_follows RLS policy
-- Drop the restrictive policy that only allows users to see their own follows
DROP POLICY IF EXISTS "Users can view their own followed venues" ON public.venue_follows;

-- Create a new policy that allows authenticated users to view all venue follows
-- This is necessary for profile views to show accurate follower counts
CREATE POLICY "Authenticated users can view all venue follows"
ON public.venue_follows 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Keep existing policies for user's own records (only create if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'venue_follows' 
    AND policyname = 'Users can follow venues'
  ) THEN
    CREATE POLICY "Users can follow venues" 
    ON public.venue_follows 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'venue_follows' 
    AND policyname = 'Users can unfollow venues'
  ) THEN
    CREATE POLICY "Users can unfollow venues" 
    ON public.venue_follows 
    FOR DELETE 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Step 3: Add helpful comments
COMMENT ON POLICY "Authenticated users can view all artist follows" ON public.artist_follows IS 'Allows profile views to show accurate artist follow counts for any user';
COMMENT ON POLICY "Authenticated users can view all venue follows" ON public.venue_follows IS 'Allows profile views to show accurate venue follow counts for any user';

-- Step 4: Verify the changes
-- These policies now allow:
-- 1. Any authenticated user to view artist/venue follows for any user (for profile displays)
-- 2. Users to only create/delete their own follows (maintains data integrity)
-- 3. Profile views to show accurate follower counts
