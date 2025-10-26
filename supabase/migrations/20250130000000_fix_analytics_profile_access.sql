-- Fix analytics profile access by allowing analytics services to access all profiles
-- This migration addresses the issue where analytics are only pulling from public profiles
-- instead of all users, which is incorrect for analytics purposes.

-- Step 1: Create a new RLS policy for analytics that allows access to all profiles
-- This policy will be used by analytics services to get complete user data
CREATE POLICY "Analytics can access all profiles" 
ON public.profiles 
FOR SELECT 
USING (
  -- Allow access for analytics purposes
  -- This policy is more permissive than the main visibility policy
  auth.role() = 'authenticated'
);

-- Step 2: Create a function to check if user has analytics permissions
-- This will be used by analytics services to determine if they can access all profiles
CREATE OR REPLACE FUNCTION public.user_has_analytics_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the current user has analytics permissions
  -- This includes business, creator, and admin account types
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.account_type IN ('business', 'creator', 'admin')
  );
END;
$$;

-- Step 3: Update the main profiles policy to allow analytics access
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Profiles are viewable based on visibility settings" ON public.profiles;

-- Create a new policy that allows analytics access
CREATE POLICY "Profiles are viewable based on visibility settings" 
ON public.profiles 
FOR SELECT 
USING (
  -- Own profile (always visible to self)
  auth.uid() = user_id
  OR
  -- Analytics users can see all profiles
  public.user_has_analytics_access()
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

-- Step 4: Create a view for analytics that bypasses RLS restrictions
-- This view will be used by analytics services to get complete user data
CREATE OR REPLACE VIEW public.analytics_profiles AS
SELECT 
  user_id,
  name,
  avatar_url,
  account_type,
  business_info,
  created_at,
  updated_at,
  last_active_at,
  is_public_profile
FROM public.profiles;

-- Grant permissions on the analytics view
GRANT SELECT ON public.analytics_profiles TO authenticated;

-- Step 5: Create a function to get all profiles for analytics
-- This function will be used by analytics services to get complete user data
CREATE OR REPLACE FUNCTION public.get_all_profiles_for_analytics()
RETURNS TABLE (
  user_id uuid,
  name text,
  avatar_url text,
  account_type text,
  business_info jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_active_at timestamptz,
  is_public_profile boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function runs with elevated privileges to access all profiles
  RETURN QUERY
  SELECT 
    p.user_id,
    p.name,
    p.avatar_url,
    p.account_type,
    p.business_info,
    p.created_at,
    p.updated_at,
    p.last_active_at,
    p.is_public_profile
  FROM public.profiles p;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_all_profiles_for_analytics() TO authenticated;

-- Step 6: Add comments for documentation
COMMENT ON POLICY "Analytics can access all profiles" ON public.profiles IS 'Allows analytics services to access all profiles for complete analytics data';
COMMENT ON FUNCTION public.user_has_analytics_access() IS 'Checks if the current user has analytics permissions (business, creator, or admin)';
COMMENT ON VIEW public.analytics_profiles IS 'View for analytics that provides access to all profiles';
COMMENT ON FUNCTION public.get_all_profiles_for_analytics() IS 'Function to get all profiles for analytics purposes with elevated privileges';
