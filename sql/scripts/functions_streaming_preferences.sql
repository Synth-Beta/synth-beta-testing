-- ============================================
-- STREAMING PREFERENCE TRACKING FUNCTIONS
-- ============================================
-- Functions for tracking all streaming-related preference signals
-- Grouped: connect, sync, top tracks/artists, recent plays, setlist

-- ============================================
-- FUNCTION: Track Spotify connection
-- ============================================
CREATE OR REPLACE FUNCTION track_streaming_spotify_connected(
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
BEGIN
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    signal_weight,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    'streaming_spotify_connected',
    'genre',
    3.0,
    jsonb_build_object('service', 'spotify'),
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track Apple Music connection
-- ============================================
CREATE OR REPLACE FUNCTION track_streaming_apple_music_connected(
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
BEGIN
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    signal_weight,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    'streaming_apple_music_connected',
    'genre',
    3.0,
    jsonb_build_object('service', 'apple-music'),
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track streaming profile sync (genre data)
-- ============================================
CREATE OR REPLACE FUNCTION track_streaming_profile_synced(
  p_user_id UUID,
  p_genre TEXT,
  p_genre_count INTEGER,
  p_service TEXT DEFAULT 'spotify'  -- 'spotify' or 'apple-music'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_weight NUMERIC(5,2);
BEGIN
  -- Calculate weight based on count (max 6.0)
  v_weight := LEAST(p_genre_count / 10.0, 6.0);

  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_name,
    signal_weight,
    genre,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    'streaming_profile_synced',
    'genre',
    p_genre,
    v_weight,
    p_genre,
    jsonb_build_object(
      'source', p_service,
      'count', p_genre_count,
      'service', p_service
    ),
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track top track (all time ranges)
-- ============================================
CREATE OR REPLACE FUNCTION track_streaming_top_track(
  p_user_id UUID,
  p_track_id TEXT DEFAULT NULL,  -- Spotify/Apple Music ID
  p_track_name TEXT,
  p_time_range TEXT DEFAULT 'long_term',  -- 'short_term', 'medium_term', 'long_term'
  p_genres TEXT[] DEFAULT NULL,
  p_service TEXT DEFAULT 'spotify'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_signal_type preference_signal_type;
  v_weight NUMERIC(5,2);
  v_genre TEXT;
BEGIN
  -- Determine signal type and weight based on time range
  CASE p_time_range
    WHEN 'short_term' THEN
      v_signal_type := 'streaming_top_track_short';
      v_weight := 4.0;
    WHEN 'medium_term' THEN
      v_signal_type := 'streaming_top_track_medium';
      v_weight := 5.0;
    ELSE  -- long_term
      v_signal_type := 'streaming_top_track_long';
      v_weight := 6.0;
  END CASE;

  -- Insert main track signal
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    v_signal_type,
    'song',
    NULL,  -- External ID stored in context
    p_track_name,
    v_weight,
    jsonb_build_object(
      'track_id', p_track_id,
      'time_range', p_time_range,
      'service', p_service
    ),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals
  IF p_genres IS NOT NULL AND array_length(p_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY p_genres
    LOOP
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        context,
        occurred_at
      ) VALUES (
        p_user_id,
        v_signal_type,
        'song',
        NULL,
        p_track_name,
        v_weight,
        v_genre,
        jsonb_build_object(
          'track_id', p_track_id,
          'time_range', p_time_range,
          'service', p_service
        ),
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track top artist (all time ranges)
-- ============================================
CREATE OR REPLACE FUNCTION track_streaming_top_artist(
  p_user_id UUID,
  p_artist_id UUID DEFAULT NULL,  -- Our artist UUID if matched
  p_artist_name TEXT,
  p_spotify_id TEXT DEFAULT NULL,
  p_time_range TEXT DEFAULT 'long_term',
  p_genres TEXT[] DEFAULT NULL,
  p_service TEXT DEFAULT 'spotify'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_signal_type preference_signal_type;
  v_weight NUMERIC(5,2);
  v_genre TEXT;
  v_artist_genres TEXT[];
BEGIN
  -- Determine signal type and weight
  CASE p_time_range
    WHEN 'short_term' THEN
      v_signal_type := 'streaming_top_artist_short';
      v_weight := 4.0;
    WHEN 'medium_term' THEN
      v_signal_type := 'streaming_top_artist_medium';
      v_weight := 5.0;
    ELSE  -- long_term
      v_signal_type := 'streaming_top_artist_long';
      v_weight := 6.0;
  END CASE;

  -- Get genres from artist if we have artist_id
  IF p_artist_id IS NOT NULL AND p_genres IS NULL THEN
    SELECT genres INTO v_artist_genres
    FROM public.artists
    WHERE id = p_artist_id;
    v_artist_genres := COALESCE(v_artist_genres, p_genres);
  ELSE
    v_artist_genres := p_genres;
  END IF;

  -- Insert main artist signal
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    v_signal_type,
    'artist',
    p_artist_id,
    p_artist_name,
    v_weight,
    jsonb_build_object(
      'spotify_id', p_spotify_id,
      'time_range', p_time_range,
      'service', p_service
    ),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals
  IF v_artist_genres IS NOT NULL AND array_length(v_artist_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY v_artist_genres
    LOOP
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        context,
        occurred_at
      ) VALUES (
        p_user_id,
        v_signal_type,
        'artist',
        p_artist_id,
        p_artist_name,
        v_weight,
        v_genre,
        jsonb_build_object(
          'spotify_id', p_spotify_id,
          'time_range', p_time_range,
          'service', p_service
        ),
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track recently played song
-- ============================================
CREATE OR REPLACE FUNCTION track_streaming_recent_play(
  p_user_id UUID,
  p_track_id TEXT DEFAULT NULL,
  p_track_name TEXT,
  p_played_at TIMESTAMPTZ,
  p_genres TEXT[] DEFAULT NULL,
  p_service TEXT DEFAULT 'spotify'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genre TEXT;
BEGIN
  -- Insert main recent play signal
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    genre,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    'streaming_recent_play',
    'song',
    NULL,
    p_track_name,
    3.0,
    p_genres[1],  -- First genre
    jsonb_build_object(
      'track_id', p_track_id,
      'played_at', p_played_at,
      'service', p_service
    ),
    p_played_at
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals
  IF p_genres IS NOT NULL AND array_length(p_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY p_genres
    LOOP
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        context,
        occurred_at
      ) VALUES (
        p_user_id,
        'streaming_recent_play',
        'song',
        NULL,
        p_track_name,
        3.0,
        v_genre,
        jsonb_build_object(
          'track_id', p_track_id,
          'played_at', p_played_at,
          'service', p_service
        ),
        p_played_at
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track song added to custom setlist
-- ============================================
CREATE OR REPLACE FUNCTION track_streaming_setlist_add(
  p_user_id UUID,
  p_song_id UUID DEFAULT NULL,
  p_song_name TEXT,
  p_setlist_id UUID DEFAULT NULL,
  p_genres TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genre TEXT;
BEGIN
  -- Insert main setlist signal
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    genre,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    'streaming_setlist_add',
    'song',
    p_song_id,
    p_song_name,
    4.0,
    p_genres[1],
    jsonb_build_object('setlist_id', p_setlist_id),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals
  IF p_genres IS NOT NULL AND array_length(p_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY p_genres
    LOOP
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        context,
        occurred_at
      ) VALUES (
        p_user_id,
        'streaming_setlist_add',
        'song',
        p_song_id,
        p_song_name,
        4.0,
        v_genre,
        jsonb_build_object('setlist_id', p_setlist_id),
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION track_streaming_spotify_connected TO authenticated;
GRANT EXECUTE ON FUNCTION track_streaming_apple_music_connected TO authenticated;
GRANT EXECUTE ON FUNCTION track_streaming_profile_synced TO authenticated;
GRANT EXECUTE ON FUNCTION track_streaming_top_track TO authenticated;
GRANT EXECUTE ON FUNCTION track_streaming_top_artist TO authenticated;
GRANT EXECUTE ON FUNCTION track_streaming_recent_play TO authenticated;
GRANT EXECUTE ON FUNCTION track_streaming_setlist_add TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION track_streaming_spotify_connected IS 'Tracks Spotify account connection. Weight: 3.0';
COMMENT ON FUNCTION track_streaming_apple_music_connected IS 'Tracks Apple Music account connection. Weight: 3.0';
COMMENT ON FUNCTION track_streaming_profile_synced IS 'Tracks streaming profile genre sync. Weight: count/10.0 (max 6.0)';
COMMENT ON FUNCTION track_streaming_top_track IS 'Tracks top track (all time ranges). Weight: 4.0/5.0/6.0';
COMMENT ON FUNCTION track_streaming_top_artist IS 'Tracks top artist (all time ranges). Weight: 4.0/5.0/6.0';
COMMENT ON FUNCTION track_streaming_recent_play IS 'Tracks recently played song. Weight: 3.0';
COMMENT ON FUNCTION track_streaming_setlist_add IS 'Tracks song added to custom setlist. Weight: 4.0';

