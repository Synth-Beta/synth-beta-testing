-- Ensure venue_follows table and all RPC functions exist
-- Fixes 404 errors for get_venue_follower_count and is_following_venue
-- Creates table if it doesn't exist, updates functions

BEGIN;

-- Step 1: Create venue_follows table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.venue_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  venue_city TEXT,
  venue_state TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique functional index that handles NULLs properly (if it doesn't exist)
-- Use functional index since we need COALESCE for NULL handling
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'venue_follows' 
    AND indexname = 'venue_follows_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX venue_follows_unique_idx ON public.venue_follows(
      user_id, 
      venue_name, 
      COALESCE(venue_city, ''), 
      COALESCE(venue_state, '')
    );
  END IF;
END $$;

-- Create indexes for performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_venue_follows_user_id ON public.venue_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_follows_venue_name ON public.venue_follows(venue_name);
CREATE INDEX IF NOT EXISTS idx_venue_follows_venue_location ON public.venue_follows(venue_name, venue_city, venue_state);
CREATE INDEX IF NOT EXISTS idx_venue_follows_created_at ON public.venue_follows(created_at);

-- Step 2: Ensure RLS is enabled
ALTER TABLE public.venue_follows ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop and recreate RLS policies (update existing)
DROP POLICY IF EXISTS "Users can view their own followed venues" ON public.venue_follows;
DROP POLICY IF EXISTS "Users can follow venues" ON public.venue_follows;
DROP POLICY IF EXISTS "Users can unfollow venues" ON public.venue_follows;
DROP POLICY IF EXISTS "Authenticated users can view all venue follows" ON public.venue_follows;

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

-- Allow authenticated users to view all venue follows (for follower counts)
CREATE POLICY "Authenticated users can view all venue follows" 
ON public.venue_follows 
FOR SELECT 
TO authenticated
USING (true);

-- Step 4: Drop existing functions if they exist (to handle parameter name changes)
-- Drop all possible variations of the function signature
DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Drop all variations of set_venue_follow
  FOR func_record IN 
    SELECT oid, proname, pg_get_function_identity_arguments(oid) as args
    FROM pg_proc 
    WHERE proname = 'set_venue_follow' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', func_record.proname, func_record.args);
  END LOOP;
  
  -- Drop all variations of is_following_venue
  FOR func_record IN 
    SELECT oid, proname, pg_get_function_identity_arguments(oid) as args
    FROM pg_proc 
    WHERE proname = 'is_following_venue' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', func_record.proname, func_record.args);
  END LOOP;
  
  -- Drop all variations of get_venue_follower_count
  FOR func_record IN 
    SELECT oid, proname, pg_get_function_identity_arguments(oid) as args
    FROM pg_proc 
    WHERE proname = 'get_venue_follower_count' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', func_record.proname, func_record.args);
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN 
    -- Continue even if drop fails
    NULL;
END $$;

-- Step 5: Create/Recreate set_venue_follow function
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
    -- Check if already exists first to avoid constraint issues
    IF NOT EXISTS (
      SELECT 1 FROM public.venue_follows
      WHERE user_id = auth.uid()
        AND venue_name = p_venue_name
        AND COALESCE(venue_city, '') = COALESCE(p_venue_city, '')
        AND COALESCE(venue_state, '') = COALESCE(p_venue_state, '')
    ) THEN
      INSERT INTO public.venue_follows (user_id, venue_name, venue_city, venue_state)
      VALUES (auth.uid(), p_venue_name, p_venue_city, p_venue_state);
    END IF;
  ELSE
    -- Delete row if not following
    -- Match using the same logic as the unique index (COALESCE for NULLs)
    DELETE FROM public.venue_follows
    WHERE user_id = auth.uid() 
      AND venue_name = p_venue_name
      AND COALESCE(venue_city, '') = COALESCE(p_venue_city, '')
      AND COALESCE(venue_state, '') = COALESCE(p_venue_state, '');
  END IF;
END;
$$;

-- Step 6: Drop existing function if it exists
DROP FUNCTION IF EXISTS public.is_following_venue(TEXT, TEXT, TEXT, UUID);

-- Step 7: Create/Recreate is_following_venue function
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
      AND COALESCE(venue_city, '') = COALESCE(p_venue_city, '')
      AND COALESCE(venue_state, '') = COALESCE(p_venue_state, '')
  ) INTO v_following;
  
  RETURN COALESCE(v_following, false);
END;
$$;

-- Step 8: Drop existing function if it exists
DROP FUNCTION IF EXISTS public.get_venue_follower_count(TEXT, TEXT, TEXT);

-- Step 9: Create/Recreate get_venue_follower_count function
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
    AND COALESCE(venue_city, '') = COALESCE(p_venue_city, '')
    AND COALESCE(venue_state, '') = COALESCE(p_venue_state, '');
  
  RETURN COALESCE(v_count, 0);
END;
$$;

-- Step 10: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.set_venue_follow(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_venue_follow(TEXT, TEXT, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.is_following_venue(TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_following_venue(TEXT, TEXT, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_venue_follower_count(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_follower_count(TEXT, TEXT, TEXT) TO anon;

-- Step 11: Ensure trigger for updated_at exists
CREATE OR REPLACE FUNCTION update_venue_follows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_venue_follows_updated_at ON public.venue_follows;
CREATE TRIGGER trigger_update_venue_follows_updated_at
  BEFORE UPDATE ON public.venue_follows
  FOR EACH ROW
  EXECUTE FUNCTION update_venue_follows_updated_at();

-- Step 12: Add/update comments for documentation
COMMENT ON TABLE public.venue_follows IS 'Tracks which venues users follow. Uses name-based matching with city/state for disambiguation.';
COMMENT ON FUNCTION public.set_venue_follow IS 'Securely toggle venue follow status using name-based matching. Returns void.';
COMMENT ON FUNCTION public.is_following_venue IS 'Checks if a user is following a specific venue by name. Returns boolean.';
COMMENT ON FUNCTION public.get_venue_follower_count IS 'Returns the number of followers for a given venue by name. Returns integer.';

COMMIT;

