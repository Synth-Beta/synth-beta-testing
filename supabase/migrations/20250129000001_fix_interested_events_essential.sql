-- Essential fix for interested events visibility issues
-- This migration only applies the critical fixes without conflicts

-- Step 1: Clean up conflicting RLS policies
DROP POLICY IF EXISTS "Users can view their own JamBase event associations" ON user_jambase_events;
DROP POLICY IF EXISTS "Authenticated users can view all JamBase event associations" ON user_jambase_events;

-- Step 2: Create the correct RLS policy for user_jambase_events
CREATE POLICY "Authenticated users can view all user event associations" 
ON user_jambase_events 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Step 3: Create the missing RPC function that ProfileView is trying to call
CREATE OR REPLACE FUNCTION public.get_user_interested_events(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  artist_name text,
  venue_name text,
  venue_city text,
  venue_state text,
  event_date timestamptz,
  doors_time timestamptz,
  description text,
  genres text[],
  price_range text,
  ticket_available boolean,
  ticket_urls text[],
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id,
    je.title,
    je.artist_name,
    je.venue_name,
    je.venue_city,
    je.venue_state,
    je.event_date,
    je.doors_time,
    je.description,
    je.genres,
    je.price_range,
    je.ticket_available,
    je.ticket_urls,
    uje.created_at
  FROM user_jambase_events uje
  JOIN jambase_events je ON uje.jambase_event_id = je.id
  WHERE uje.user_id = target_user_id
  ORDER BY uje.created_at DESC;
END;
$$;

-- Step 4: Create a helper function to get users interested in an event
CREATE OR REPLACE FUNCTION public.get_users_interested_in_event(event_id uuid)
RETURNS TABLE (
  user_id uuid,
  name text,
  avatar_url text,
  bio text,
  instagram_handle text,
  snapchat_handle text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.user_id,
    p.name,
    p.avatar_url,
    p.bio,
    p.instagram_handle,
    p.snapchat_handle,
    p.created_at,
    p.updated_at
  FROM user_jambase_events uje
  JOIN profiles p ON uje.user_id = p.user_id
  WHERE uje.jambase_event_id = event_id
  ORDER BY uje.created_at DESC;
END;
$$;

-- Step 5: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_interested_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_interested_in_event(uuid) TO authenticated;

-- Step 6: Ensure all necessary permissions are granted
GRANT SELECT ON public.user_jambase_events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_jambase_events TO authenticated;
GRANT SELECT ON public.jambase_events TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
