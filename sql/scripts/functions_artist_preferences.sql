-- ============================================
-- ARTIST PREFERENCE TRACKING FUNCTIONS
-- ============================================
-- Functions for tracking all artist-related preference signals
-- Grouped: follow, unfollow, search, review

-- ============================================
-- FUNCTION: Track artist follow
-- ============================================
CREATE OR REPLACE FUNCTION track_artist_follow(
  p_user_id UUID,
  p_artist_id UUID DEFAULT NULL,
  p_artist_name TEXT DEFAULT NULL,
  p_jambase_artist_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_artist_uuid UUID;
  v_artist_name TEXT;
  v_genres TEXT[];
  v_genre TEXT;
BEGIN
  -- Resolve artist UUID and name
  IF p_artist_id IS NOT NULL THEN
    v_artist_uuid := p_artist_id;
    SELECT name, genres INTO v_artist_name, v_genres
    FROM public.artists
    WHERE id = p_artist_id;
  ELSIF p_jambase_artist_id IS NOT NULL THEN
    SELECT id, name, genres INTO v_artist_uuid, v_artist_name, v_genres
    FROM public.artists
    WHERE jambase_artist_id = p_jambase_artist_id
    LIMIT 1;
  END IF;

  -- Fallback to provided name
  IF v_artist_name IS NULL THEN
    v_artist_name := COALESCE(p_artist_name, 'Unknown Artist');
  END IF;

  -- Insert main artist follow signal
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    occurred_at
  ) VALUES (
    p_user_id,
    'artist_follow',
    'artist',
    v_artist_uuid,
    v_artist_name,
    7.0,
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert one signal per genre (normalized)
  IF v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY v_genres
    LOOP
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        occurred_at
      ) VALUES (
        p_user_id,
        'artist_follow',
        'artist',
        v_artist_uuid,
        v_artist_name,
        7.0,
        v_genre,
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track artist unfollow
-- ============================================
CREATE OR REPLACE FUNCTION track_artist_unfollow(
  p_user_id UUID,
  p_artist_id UUID DEFAULT NULL,
  p_artist_name TEXT DEFAULT NULL,
  p_jambase_artist_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_artist_uuid UUID;
  v_artist_name TEXT;
  v_genres TEXT[];
  v_genre TEXT;
BEGIN
  -- Resolve artist UUID and name
  IF p_artist_id IS NOT NULL THEN
    v_artist_uuid := p_artist_id;
    SELECT name, genres INTO v_artist_name, v_genres
    FROM public.artists
    WHERE id = p_artist_id;
  ELSIF p_jambase_artist_id IS NOT NULL THEN
    SELECT id, name, genres INTO v_artist_uuid, v_artist_name, v_genres
    FROM public.artists
    WHERE jambase_artist_id = p_jambase_artist_id
    LIMIT 1;
  END IF;

  IF v_artist_name IS NULL THEN
    v_artist_name := COALESCE(p_artist_name, 'Unknown Artist');
  END IF;

  -- Insert unfollow signal (negative weight)
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    occurred_at
  ) VALUES (
    p_user_id,
    'artist_unfollow',
    'artist',
    v_artist_uuid,
    v_artist_name,
    -2.0,  -- Negative signal
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals (negative)
  IF v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY v_genres
    LOOP
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        occurred_at
      ) VALUES (
        p_user_id,
        'artist_unfollow',
        'artist',
        v_artist_uuid,
        v_artist_name,
        -2.0,
        v_genre,
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track artist search
-- ============================================
CREATE OR REPLACE FUNCTION track_artist_search(
  p_user_id UUID,
  p_search_query TEXT,
  p_artist_id UUID DEFAULT NULL,
  p_artist_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genres TEXT[];
  v_genre TEXT;
BEGIN
  -- Get genres if artist is found
  IF p_artist_id IS NOT NULL THEN
    SELECT genres INTO v_genres
    FROM public.artists
    WHERE id = p_artist_id;
  END IF;

  -- Insert main search signal
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
    'artist_search',
    'artist',
    p_artist_id,
    COALESCE(p_artist_name, p_search_query),
    2.0,  -- Lower weight for searches
    jsonb_build_object('search_query', p_search_query),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals if artist found
  IF v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY v_genres
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
        'artist_search',
        'artist',
        p_artist_id,
        COALESCE(p_artist_name, p_search_query),
        2.0,
        v_genre,
        jsonb_build_object('search_query', p_search_query),
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track artist review
-- ============================================
CREATE OR REPLACE FUNCTION track_artist_review(
  p_user_id UUID,
  p_review_id UUID,
  p_artist_id UUID,
  p_rating NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_artist_name TEXT;
  v_genres TEXT[];
  v_genre TEXT;
  v_weight NUMERIC(5,2) := 8.0;
BEGIN
  -- Get artist details
  SELECT name, genres INTO v_artist_name, v_genres
  FROM public.artists
  WHERE id = p_artist_id;

  -- Adjust weight by rating if provided (1-5 scale)
  IF p_rating IS NOT NULL THEN
    v_weight := v_weight * (p_rating / 5.0);
  END IF;

  -- Insert main review signal
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
    'artist_review',
    'artist',
    p_artist_id,
    COALESCE(v_artist_name, 'Unknown Artist'),
    v_weight,
    jsonb_build_object('review_id', p_review_id, 'rating', p_rating),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals
  IF v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY v_genres
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
        'artist_review',
        'artist',
        p_artist_id,
        COALESCE(v_artist_name, 'Unknown Artist'),
        v_weight,
        v_genre,
        jsonb_build_object('review_id', p_review_id, 'rating', p_rating),
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
GRANT EXECUTE ON FUNCTION track_artist_follow TO authenticated;
GRANT EXECUTE ON FUNCTION track_artist_unfollow TO authenticated;
GRANT EXECUTE ON FUNCTION track_artist_search TO authenticated;
GRANT EXECUTE ON FUNCTION track_artist_review TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION track_artist_follow IS 'Tracks artist follow signal with genre extraction. Weight: 7.0';
COMMENT ON FUNCTION track_artist_unfollow IS 'Tracks artist unfollow signal (negative). Weight: -2.0';
COMMENT ON FUNCTION track_artist_search IS 'Tracks artist search signal. Weight: 2.0';
COMMENT ON FUNCTION track_artist_review IS 'Tracks artist review signal. Weight: 8.0 (scaled by rating)';

