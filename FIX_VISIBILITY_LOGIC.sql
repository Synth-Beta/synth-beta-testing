-- Fix the visibility logic to match the correct requirements
-- Run this to update the existing RLS policy

-- Drop the existing policy
DROP POLICY IF EXISTS "Profiles are viewable based on visibility settings" ON public.profiles;

-- Create the corrected visibility-aware policy
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

-- Test the new policy with a sample query
SELECT 
    user_id,
    name,
    avatar_url IS NOT NULL AND avatar_url != '' AND TRIM(avatar_url) != '' as has_avatar,
    is_public_profile,
    CASE 
        WHEN user_id = auth.uid() THEN 'Own profile (always visible)'
        WHEN EXISTS (
            SELECT 1 FROM public.friends
            WHERE (user1_id = auth.uid() AND user2_id = profiles.user_id)
               OR (user2_id = auth.uid() AND user1_id = profiles.user_id)
        ) THEN 'Friend (always visible)'
        WHEN (avatar_url IS NOT NULL AND avatar_url != '' AND TRIM(avatar_url) != '' AND is_public_profile = true) 
        THEN 'Public with avatar (visible to all)'
        ELSE 'Hidden'
    END as visibility_status
FROM public.profiles
ORDER BY name;

-- ============================================================================
-- SUMMARY OF NEW LOGIC:
-- ============================================================================
-- 
-- 1. FRIENDS: Always visible to each other (regardless of privacy settings)
-- 2. SEARCH: Shows all users with profile pictures (regardless of privacy)
-- 3. PUBLIC vs PRIVATE only affects:
--    - Event attendance visibility
--    - Review restrictions (public reviews visible to all, private only to friends)
--    - Event matching (only public users appear for matching)
-- 
-- This means:
-- - Private users with profile pics still appear in search
-- - Friends can always see each other
-- - Only public users are visible for event interactions/matching
-- ============================================================================
