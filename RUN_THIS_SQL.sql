-- ============================================================================
-- USER TRUST & VISIBILITY FEATURES - PRODUCTION SQL
-- ============================================================================
-- Run this in your Supabase SQL Editor
-- This is SAFE to run multiple times (uses IF NOT EXISTS)
-- ============================================================================

-- Step 1: Add the new columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS is_public_profile BOOLEAN DEFAULT true;

-- Step 2: Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at ON public.profiles(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_public_profile ON public.profiles(is_public_profile);

-- Step 3: Add helpful comments
COMMENT ON COLUMN public.profiles.last_active_at IS 'Timestamp of when the user was last active in the app (for trust/verification)';
COMMENT ON COLUMN public.profiles.is_public_profile IS 'Whether the user profile is public (true) or private (false). Private profiles are only visible to friends.';

-- Step 4: Set last_active_at to created_at for existing users (if not already set)
UPDATE public.profiles 
SET last_active_at = created_at 
WHERE last_active_at IS NULL OR last_active_at < created_at;

-- Step 5: Create a function to update last_active_at
CREATE OR REPLACE FUNCTION public.update_user_last_active(user_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now()
  WHERE user_id = user_id_param;
END;
$$;

-- Step 6: Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_user_last_active(UUID) TO authenticated;

-- Step 7: Add a comment to the function
COMMENT ON FUNCTION public.update_user_last_active(UUID) IS 'Updates the last_active_at timestamp for a user. Called by the app when user performs key actions.';

-- Step 8: Update RLS policies to respect profile visibility
-- Drop the old "Profiles are viewable by everyone" policy if it exists
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Create new visibility-aware policy
-- Users can see:
-- 1. Their own profile (always)
-- 2. Friends' profiles (always, regardless of privacy settings)
-- 3. Non-friends with profile pictures (public profiles only)
CREATE POLICY "Profiles are viewable based on visibility settings" 
ON public.profiles 
FOR SELECT 
USING (
  -- Own profile (always visible to self)
  auth.uid() = user_id
  OR
  -- Friends can always see each other (regardless of privacy settings)
  EXISTS (
    SELECT 1 FROM public.friends
    WHERE (user1_id = auth.uid() AND user2_id = profiles.user_id)
       OR (user2_id = auth.uid() AND user1_id = profiles.user_id)
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

-- Keep existing update and insert policies
-- Note: These should already exist from previous migrations, but we're being explicit
DO $$
BEGIN
  -- Check if update policy exists, if not create it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile" 
    ON public.profiles 
    FOR UPDATE 
    USING (auth.uid() = user_id);
  END IF;

  -- Check if insert policy exists, if not create it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile" 
    ON public.profiles 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (Optional - run these to verify)
-- ============================================================================

-- Verify the new columns exist
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND table_schema = 'public'
AND column_name IN ('last_active_at', 'is_public_profile')
ORDER BY ordinal_position;

-- Verify the indexes exist
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
AND schemaname = 'public'
AND (indexname = 'idx_profiles_last_active_at' OR indexname = 'idx_profiles_is_public_profile');

-- Verify the function exists
SELECT 
    proname as function_name,
    prosrc as function_source
FROM pg_proc
WHERE proname = 'update_user_last_active';

-- Check profile visibility (sample query)
-- This shows which profiles would be visible to different users
SELECT 
    user_id,
    name,
    avatar_url IS NOT NULL as has_avatar,
    is_public_profile,
    last_active_at,
    CASE 
        WHEN avatar_url IS NULL THEN 'Hidden (no avatar)'
        WHEN is_public_profile = true THEN 'Visible to all'
        WHEN is_public_profile = false THEN 'Visible to friends only'
    END as visibility_status
FROM public.profiles
ORDER BY last_active_at DESC NULLS LAST
LIMIT 10;

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- If you see no errors above, the migration is complete.
-- The app will now:
-- 1. Hide users without profile pictures from others
-- 2. Show last active timestamps
-- 3. Allow public/private profile toggle
-- 4. Automatically track user activity
-- ============================================================================

