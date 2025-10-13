-- Fix search visibility to show ALL users regardless of profile picture
-- This is separate from the general profile visibility policy

-- Drop the existing policy
DROP POLICY IF EXISTS "Profiles are viewable based on visibility settings" ON public.profiles;

-- Create the corrected policy that separates SEARCH visibility from PROFILE visibility
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
  -- NON-FRIENDS: Show ALL users in search (no profile picture requirement)
  -- The client-side filtering will handle what to show based on context
  true
);

-- Test the new policy - should now show ALL users
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
        WHEN (avatar_url IS NOT NULL AND avatar_url != '' AND TRIM(avatar_url) != '') 
        THEN 'Has avatar (visible in search)'
        ELSE 'No avatar (visible in search)'
    END as visibility_status
FROM public.profiles
ORDER BY name;

-- ============================================================================
-- SUMMARY OF NEW LOGIC:
-- ============================================================================
-- 
-- 1. FRIENDS: Always visible to each other (regardless of privacy settings)
-- 2. SEARCH: Shows ALL users (no profile picture requirement at DB level)
-- 3. CLIENT-SIDE FILTERING: The UserVisibilityService will handle what to show:
--    - Search results: Show all users (regardless of profile picture)
--    - Profile viewing: Apply profile picture + privacy rules
--    - Event matching: Apply profile picture + privacy rules
-- 
-- This means:
-- - ALL users appear in search results
-- - Friends can always see each other's full profiles
-- - Profile picture requirements are handled client-side per context
-- ============================================================================
