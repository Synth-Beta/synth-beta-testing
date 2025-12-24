-- ============================================================
-- Create set_artist_follow RPC function
-- ============================================================
-- This function allows users to follow/unfollow artists
-- It uses the artist_follows table and handles the current user automatically

-- Drop existing function if it exists (to handle parameter changes)
DROP FUNCTION IF EXISTS public.set_artist_follow(UUID, BOOLEAN) CASCADE;

-- Create the function
CREATE OR REPLACE FUNCTION public.set_artist_follow(
  p_artist_id UUID,
  p_following BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the artist exists
  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = p_artist_id) THEN
    RAISE EXCEPTION 'Artist with ID % does not exist', p_artist_id;
  END IF;

  IF p_following THEN
    -- Insert follow record (presence-based: row exists = following)
    INSERT INTO public.artist_follows (user_id, artist_id)
    VALUES (auth.uid(), p_artist_id)
    ON CONFLICT (user_id, artist_id) 
    DO NOTHING; -- Already following, no error
  ELSE
    -- Delete follow record (unfollow)
    DELETE FROM public.artist_follows
    WHERE user_id = auth.uid() 
      AND artist_id = p_artist_id;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_artist_follow(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_artist_follow(UUID, BOOLEAN) TO anon;

-- Add comment
COMMENT ON FUNCTION public.set_artist_follow(UUID, BOOLEAN) IS 'Toggles artist follow status for the current user. p_following=true adds a follow, p_following=false removes it.';

