-- ============================================
-- FIX ARTIST FOLLOWS SYSTEM
-- ============================================
-- This SQL works with the EXISTING artist_follows table
-- Creates RPC functions and views needed for artist following
-- NO NEW TABLES - Uses existing infrastructure

-- Step 0: Ensure RLS policies exist for artist_follows table
-- Enable RLS if not already enabled
ALTER TABLE public.artist_follows ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they exist
DROP POLICY IF EXISTS "Users can view their own followed artists" ON public.artist_follows;
DROP POLICY IF EXISTS "Authenticated users can view all artist follows" ON public.artist_follows;
DROP POLICY IF EXISTS "Users can follow artists" ON public.artist_follows;
DROP POLICY IF EXISTS "Users can unfollow artists" ON public.artist_follows;

-- Create SELECT policy (allow viewing all for profile counts)
CREATE POLICY "Authenticated users can view all artist follows"
ON public.artist_follows 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Create INSERT policy (users can only insert their own)
CREATE POLICY "Users can follow artists" 
ON public.artist_follows 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create DELETE policy (users can only delete their own)
CREATE POLICY "Users can unfollow artists" 
ON public.artist_follows 
FOR DELETE 
USING (auth.uid() = user_id);

-- Step 1: Create secure RPC function using artist_follows table
CREATE OR REPLACE FUNCTION public.set_artist_follow(p_artist_id UUID, p_following BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_following THEN
    -- Insert row if following (presence-based)
    INSERT INTO public.artist_follows (user_id, artist_id)
    VALUES (auth.uid(), p_artist_id)
    ON CONFLICT (user_id, artist_id) 
    DO NOTHING;
  ELSE
    -- Delete row if not following
    DELETE FROM public.artist_follows
    WHERE user_id = auth.uid() AND artist_id = p_artist_id;
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_artist_follow(UUID, BOOLEAN) TO authenticated;

-- Step 2: Create function to check if user follows an artist
CREATE OR REPLACE FUNCTION public.is_following_artist(p_artist_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_following BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.artist_follows
    WHERE artist_id = p_artist_id AND user_id = p_user_id
  ) INTO v_following;
  
  RETURN COALESCE(v_following, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_following_artist(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_following_artist(UUID, UUID) TO anon;

-- Step 3: Create function to get follower count for an artist
CREATE OR REPLACE FUNCTION public.get_artist_follower_count(p_artist_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.artist_follows
  WHERE artist_id = p_artist_id;
  
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_artist_follower_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_follower_count(UUID) TO anon;

-- Step 4: Create view for artist follows with details
-- Uses ONLY the artists table (not artist_profile)
DROP VIEW IF EXISTS public.artist_follows_with_details;

CREATE OR REPLACE VIEW public.artist_follows_with_details AS
SELECT 
  af.id,
  af.user_id,
  af.artist_id,
  af.created_at,
  af.updated_at,
  a.name as artist_name,
  a.image_url as artist_image_url,
  a.jambase_artist_id,
  NULL::INTEGER as num_upcoming_events,  -- Not available from artists table
  COALESCE(af.artist_genres, NULL::TEXT[]) as genres,  -- Use genres from artist_follows if available
  p.name as user_name,
  p.avatar_url as user_avatar_url
FROM public.artist_follows af
LEFT JOIN public.artists a ON af.artist_id = a.id
LEFT JOIN public.profiles p ON af.user_id = p.user_id;

-- Grant permissions on the view
GRANT SELECT ON public.artist_follows_with_details TO authenticated;

-- Step 5: Fix trigger function to not reference artist_profile
-- The trigger capture_artist_follow_music_data references artist_profile which doesn't exist
CREATE OR REPLACE FUNCTION capture_artist_follow_music_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_artist_record RECORD;
  v_genre TEXT;
BEGIN
  -- Get artist data WITHOUT artist_profile join (use artist_genres from artist_follows if available)
  SELECT 
    a.id, 
    a.name, 
    a.jambase_artist_id,
    COALESCE(NEW.artist_genres, ARRAY[]::TEXT[]) as genres,  -- Use genres from artist_follows table
    NULL::INTEGER as num_upcoming_events  -- Not available without artist_profile
  INTO v_artist_record
  FROM artists a
  WHERE a.id = NEW.artist_id;
  
  -- If artist not found, return early
  IF v_artist_record.id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Insert artist interaction FOR THIS USER
  INSERT INTO user_artist_interactions (
    user_id,
    artist_id,
    artist_name,
    jambase_artist_id,
    interaction_type,
    interaction_strength,
    genres,
    source_entity_type,
    source_entity_id,
    metadata,
    occurred_at
  ) VALUES (
    NEW.user_id,
    NEW.artist_id,
    v_artist_record.name,
    v_artist_record.jambase_artist_id,
    'follow',
    7,
    v_artist_record.genres,
    'artist_follow',
    NEW.id::TEXT,
    jsonb_build_object(
      'action', 'follow',
      'upcoming_events', v_artist_record.num_upcoming_events
    ),
    NEW.created_at
  );
  
  -- Insert genre interactions FOR THIS USER (one per genre)
  IF array_length(v_artist_record.genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_artist_record.genres) LOOP
      INSERT INTO user_genre_interactions (
        user_id,
        genre,
        interaction_type,
        interaction_count,
        artist_names,
        artist_ids,
        source_entity_type,
        source_entity_id,
        occurred_at
      ) VALUES (
        NEW.user_id,
        v_genre,
        'follow',
        1,
        ARRAY[v_artist_record.name],
        ARRAY[v_artist_record.id],
        'artist_follow',
        NEW.id::TEXT,
        NEW.created_at
      )
      ON CONFLICT DO NOTHING;  -- Ignore conflicts
    END LOOP;
  END IF;
  
  -- Update artist preference signal FOR THIS USER
  INSERT INTO music_preference_signals (
    user_id,
    preference_type,
    preference_value,
    preference_score,
    interaction_count,
    interaction_types,
    first_interaction,
    last_interaction,
    confidence
  ) VALUES (
    NEW.user_id,
    'artist',
    v_artist_record.name,
    7.0,
    1,
    jsonb_build_object('follow', 1),
    NEW.created_at,
    NEW.created_at,
    0.7
  )
  ON CONFLICT (user_id, preference_type, preference_value) 
  DO UPDATE SET
    preference_score = music_preference_signals.preference_score + 7.0,
    interaction_count = music_preference_signals.interaction_count + 1,
    interaction_types = jsonb_set(
      music_preference_signals.interaction_types,
      '{follow}',
      to_jsonb(COALESCE((music_preference_signals.interaction_types->>'follow')::INT, 0) + 1)
    ),
    last_interaction = NEW.created_at,
    updated_at = now();
  
  -- Update genre preference signals FOR THIS USER
  IF array_length(v_artist_record.genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_artist_record.genres) LOOP
      INSERT INTO music_preference_signals (
        user_id,
        preference_type,
        preference_value,
        preference_score,
        interaction_count,
        interaction_types,
        first_interaction,
        last_interaction,
        confidence
      ) VALUES (
        NEW.user_id,
        'genre',
        v_genre,
        5.0,
        1,
        jsonb_build_object('follow', 1),
        NEW.created_at,
        NEW.created_at,
        0.6
      )
      ON CONFLICT (user_id, preference_type, preference_value)
      DO UPDATE SET
        preference_score = music_preference_signals.preference_score + 5.0,
        interaction_count = music_preference_signals.interaction_count + 1,
        interaction_types = jsonb_set(
          music_preference_signals.interaction_types,
          '{follow}',
          to_jsonb(COALESCE((music_preference_signals.interaction_types->>'follow')::INT, 0) + 1)
        ),
        last_interaction = NEW.created_at,
        updated_at = now();
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Step 6: Add comments
COMMENT ON FUNCTION public.set_artist_follow IS 'Securely toggle artist follow status using presence-based model. Uses artist_follows table.';
COMMENT ON FUNCTION public.get_artist_follower_count IS 'Returns the number of followers for a given artist. Uses artist_follows table.';
COMMENT ON FUNCTION public.is_following_artist IS 'Checks if a user is following a specific artist. Uses artist_follows table.';
COMMENT ON VIEW public.artist_follows_with_details IS 'Artist follows with denormalized artist and user details. Uses artists table only (no artist_profile dependency).';
COMMENT ON FUNCTION capture_artist_follow_music_data IS 'Captures music metadata when user follows an artist. Updated to not reference artist_profile table.';

-- ============================================
-- VERIFICATION
-- ============================================
-- Run these to verify:
-- SELECT proname FROM pg_proc WHERE proname LIKE '%artist%follow%';
-- SELECT * FROM public.artist_follows_with_details LIMIT 1;
