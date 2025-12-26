-- ============================================
-- GENRE PREFERENCE TRACKING FUNCTIONS
-- ============================================
-- Functions for tracking genre-related preference signals
-- Grouped: search, manual preferences

-- ============================================
-- FUNCTION: Track genre search
-- ============================================
CREATE OR REPLACE FUNCTION track_genre_search(
  p_user_id UUID,
  p_search_query TEXT,
  p_genre TEXT DEFAULT NULL  -- Extracted genre if known
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genre TEXT;
BEGIN
  -- Use provided genre or search query
  v_genre := COALESCE(p_genre, p_search_query);

  -- Insert genre search signal
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
    'genre_search',
    'genre',
    v_genre,
    2.0,  -- Lower weight for searches
    v_genre,
    jsonb_build_object('search_query', p_search_query),
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track manual genre preference
-- ============================================
CREATE OR REPLACE FUNCTION track_genre_manual_preference(
  p_user_id UUID,
  p_genre TEXT,
  p_weight NUMERIC(5,2) DEFAULT 9.0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
BEGIN
  -- Insert manual genre preference signal
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
    'genre_manual_preference',
    'genre',
    p_genre,
    LEAST(p_weight, 10.0),  -- Max 10.0
    p_genre,
    jsonb_build_object('source', 'manual', 'weight', p_weight),
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track manual artist preference
-- ============================================
CREATE OR REPLACE FUNCTION track_artist_manual_preference(
  p_user_id UUID,
  p_artist_id UUID,
  p_weight NUMERIC(5,2) DEFAULT 9.0
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
BEGIN
  -- Get artist details
  SELECT name, genres INTO v_artist_name, v_genres
  FROM public.artists
  WHERE id = p_artist_id;

  -- Insert main manual preference signal
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
    'artist_manual_preference',
    'artist',
    p_artist_id,
    COALESCE(v_artist_name, 'Unknown Artist'),
    LEAST(p_weight, 10.0),
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
        occurred_at
      ) VALUES (
        p_user_id,
        'artist_manual_preference',
        'artist',
        p_artist_id,
        COALESCE(v_artist_name, 'Unknown Artist'),
        LEAST(p_weight, 10.0),
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
-- FUNCTION: Track manual venue preference
-- ============================================
CREATE OR REPLACE FUNCTION track_venue_manual_preference(
  p_user_id UUID,
  p_venue_id UUID DEFAULT NULL,
  p_venue_name TEXT DEFAULT NULL,
  p_weight NUMERIC(5,2) DEFAULT 9.0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_venue_uuid UUID;
  v_venue_name TEXT;
BEGIN
  -- Resolve venue UUID and name
  IF p_venue_id IS NOT NULL THEN
    v_venue_uuid := p_venue_id;
    SELECT name INTO v_venue_name
    FROM public.venues
    WHERE id = p_venue_id;
  END IF;

  IF v_venue_name IS NULL THEN
    v_venue_name := COALESCE(p_venue_name, 'Unknown Venue');
  END IF;

  -- Insert manual venue preference signal
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
    'venue_manual_preference',
    'venue',
    v_venue_uuid,
    v_venue_name,
    LEAST(p_weight, 10.0),
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION track_genre_search TO authenticated;
GRANT EXECUTE ON FUNCTION track_genre_manual_preference TO authenticated;
GRANT EXECUTE ON FUNCTION track_artist_manual_preference TO authenticated;
GRANT EXECUTE ON FUNCTION track_venue_manual_preference TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION track_genre_search IS 'Tracks genre search. Weight: 2.0';
COMMENT ON FUNCTION track_genre_manual_preference IS 'Tracks manual genre preference. Weight: 9.0 (default)';
COMMENT ON FUNCTION track_artist_manual_preference IS 'Tracks manual artist preference with genre extraction. Weight: 9.0 (default)';
COMMENT ON FUNCTION track_venue_manual_preference IS 'Tracks manual venue preference. Weight: 9.0 (default)';

