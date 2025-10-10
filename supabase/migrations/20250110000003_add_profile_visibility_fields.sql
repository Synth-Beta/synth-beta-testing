-- Add profile visibility and activity tracking fields to profiles table
-- This migration adds:
-- 1. last_active_at: Tracks when the user was last active in the app
-- 2. is_public_profile: Controls whether the user's profile is publicly visible

-- IMPORTANT: This migration is SAFE to run multiple times (uses IF NOT EXISTS)

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

