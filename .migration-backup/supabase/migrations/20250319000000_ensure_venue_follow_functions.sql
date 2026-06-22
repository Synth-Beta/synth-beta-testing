-- ============================================
-- ENSURE VENUE FOLLOW FUNCTIONS EXIST
-- ============================================
-- This migration ensures all venue follow RPC functions exist
-- Addresses 404 errors when calling set_venue_follow

-- Step 1: Ensure venue_follows table exists
CREATE TABLE IF NOT EXISTS public.venue_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  venue_city TEXT,
  venue_state TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_name, venue_city, venue_state)
);

-- Step 2: Create/Recreate the set_venue_follow function
CREATE OR REPLACE FUNCTION public.set_venue_follow(
  p_venue_name TEXT, 
  p_venue_city TEXT, 
  p_venue_state TEXT, 
  p_following BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_following THEN
    -- Insert row if following (presence-based)
    INSERT INTO public.venue_follows (user_id, venue_name, venue_city, venue_state)
    VALUES (auth.uid(), p_venue_name, p_venue_city, p_venue_state)
    ON CONFLICT (user_id, venue_name, venue_city, venue_state) 
    DO NOTHING;
  ELSE
    -- Delete row if not following
    DELETE FROM public.venue_follows
    WHERE user_id = auth.uid() 
      AND venue_name = p_venue_name
      AND (venue_city IS NULL OR venue_city = p_venue_city OR p_venue_city IS NULL)
      AND (venue_state IS NULL OR venue_state = p_venue_state OR p_venue_state IS NULL);
  END IF;
END;
$$;

-- Step 3: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.set_venue_follow(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_venue_follow(TEXT, TEXT, TEXT, BOOLEAN) TO anon;

-- Step 4: Ensure is_following_venue function exists
CREATE OR REPLACE FUNCTION public.is_following_venue(
  p_venue_name TEXT, 
  p_venue_city TEXT, 
  p_venue_state TEXT, 
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_following BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_follows
    WHERE user_id = p_user_id
      AND venue_name = p_venue_name
      AND (venue_city IS NULL OR venue_city = p_venue_city OR p_venue_city IS NULL)
      AND (venue_state IS NULL OR venue_state = p_venue_state OR p_venue_state IS NULL)
  ) INTO v_following;
  
  RETURN v_following;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_following_venue(TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_following_venue(TEXT, TEXT, TEXT, UUID) TO anon;

-- Step 5: Ensure get_venue_follower_count function exists
CREATE OR REPLACE FUNCTION public.get_venue_follower_count(
  p_venue_name TEXT, 
  p_venue_city TEXT, 
  p_venue_state TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.venue_follows
  WHERE venue_name = p_venue_name
    AND (venue_city IS NULL OR venue_city = p_venue_city OR p_venue_city IS NULL)
    AND (venue_state IS NULL OR venue_state = p_venue_state OR p_venue_state IS NULL);
  
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_follower_count(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_follower_count(TEXT, TEXT, TEXT) TO anon;

-- Step 6: Enable RLS on venue_follows if not already enabled
ALTER TABLE public.venue_follows ENABLE ROW LEVEL SECURITY;

-- Step 7: Create/Recreate RLS policies
DROP POLICY IF EXISTS "Users can view their own followed venues" ON public.venue_follows;
DROP POLICY IF EXISTS "Users can follow venues" ON public.venue_follows;
DROP POLICY IF EXISTS "Users can unfollow venues" ON public.venue_follows;

CREATE POLICY "Users can view their own followed venues" 
ON public.venue_follows 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can follow venues" 
ON public.venue_follows 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unfollow venues" 
ON public.venue_follows 
FOR DELETE 
USING (auth.uid() = user_id);

-- Step 8: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_venue_follows_user_id ON public.venue_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_follows_venue_name ON public.venue_follows(venue_name);
CREATE INDEX IF NOT EXISTS idx_venue_follows_venue_location ON public.venue_follows(venue_name, venue_city, venue_state);
CREATE INDEX IF NOT EXISTS idx_venue_follows_created_at ON public.venue_follows(created_at);

-- Step 9: Add comments for documentation
COMMENT ON FUNCTION public.set_venue_follow IS 'Securely toggle venue follow status using name-based matching. Returns void.';
COMMENT ON FUNCTION public.is_following_venue IS 'Checks if a user is following a specific venue by name. Returns boolean.';
COMMENT ON FUNCTION public.get_venue_follower_count IS 'Returns the number of followers for a given venue by name. Returns integer.';

