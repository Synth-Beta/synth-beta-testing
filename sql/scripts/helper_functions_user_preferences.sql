-- ============================================
-- HELPER FUNCTIONS FOR USER PREFERENCES
-- ============================================
-- Convenience functions for inserting preference signals with proper weights

-- ============================================
-- FUNCTION: Insert artist follow signal
-- ============================================
CREATE OR REPLACE FUNCTION insert_artist_follow_signal(
  p_user_id UUID,
  p_artist_id UUID,
  p_artist_name TEXT,
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
  -- Insert main signal
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
    p_artist_id,
    p_artist_name,
    7.0,  -- High weight for follows
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert one signal per genre (normalized)
  IF p_genres IS NOT NULL THEN
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
        occurred_at
      ) VALUES (
        p_user_id,
        'artist_follow',
        'artist',
        p_artist_id,
        p_artist_name,
        7.0,
        v_genre,
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Insert event interest signal
-- ============================================
CREATE OR REPLACE FUNCTION insert_event_interest_signal(
  p_user_id UUID,
  p_event_id UUID,
  p_event_name TEXT,
  p_genres TEXT[] DEFAULT NULL,
  p_is_interested BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genre TEXT;
  v_signal_type preference_signal_type;
  v_weight NUMERIC(5,2);
BEGIN
  IF p_is_interested THEN
    v_signal_type := 'event_interest';
    v_weight := 5.0;
  ELSE
    v_signal_type := 'event_interest_removed';
    v_weight := -2.0;  -- Negative weight for removal
  END IF;

  -- Insert main signal
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
    v_signal_type,
    'event',
    p_event_id,
    p_event_name,
    v_weight,
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert one signal per genre (normalized)
  IF p_genres IS NOT NULL AND p_is_interested THEN
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
        occurred_at
      ) VALUES (
        p_user_id,
        v_signal_type,
        'event',
        p_event_id,
        p_event_name,
        v_weight,
        v_genre,
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Insert event attendance signal
-- ============================================
CREATE OR REPLACE FUNCTION insert_event_attendance_signal(
  p_user_id UUID,
  p_event_id UUID,
  p_event_name TEXT,
  p_genres TEXT[] DEFAULT NULL,
  p_was_there BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genre TEXT;
  v_signal_type preference_signal_type;
  v_weight NUMERIC(5,2);
BEGIN
  IF p_was_there THEN
    v_signal_type := 'event_attendance';
    v_weight := 10.0;  -- Highest weight for attendance
  ELSE
    v_signal_type := 'event_attendance_removed';
    v_weight := -3.0;  -- Negative weight for removal
  END IF;

  -- Insert main signal
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
    v_signal_type,
    'event',
    p_event_id,
    p_event_name,
    v_weight,
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert one signal per genre (normalized)
  IF p_genres IS NOT NULL AND p_was_there THEN
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
        occurred_at
      ) VALUES (
        p_user_id,
        v_signal_type,
        'event',
        p_event_id,
        p_event_name,
        v_weight,
        v_genre,
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Insert review signal
-- ============================================
CREATE OR REPLACE FUNCTION insert_review_signal(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_event_name TEXT,
  p_rating NUMERIC DEFAULT NULL,
  p_genres TEXT[] DEFAULT NULL,
  p_action TEXT DEFAULT 'created'  -- 'created', 'updated', 'deleted'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genre TEXT;
  v_signal_type preference_signal_type;
  v_weight NUMERIC(5,2);
BEGIN
  -- Determine signal type and weight based on action
  CASE p_action
    WHEN 'created' THEN
      v_signal_type := 'event_review_created';
      v_weight := 8.0;  -- High weight for reviews
    WHEN 'updated' THEN
      v_signal_type := 'event_review_updated';
      v_weight := 6.0;  -- Medium weight for updates
    WHEN 'deleted' THEN
      v_signal_type := 'event_review_deleted';
      v_weight := -4.0;  -- Negative weight for deletion
    ELSE
      v_signal_type := 'event_review_created';
      v_weight := 8.0;
  END CASE;

  -- Adjust weight based on rating (if provided)
  IF p_rating IS NOT NULL THEN
    -- Scale weight by rating (1-5 stars)
    -- 5 stars = full weight, 1 star = 20% of weight
    v_weight := v_weight * (p_rating / 5.0);
  END IF;

  -- Insert main signal
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
    'event',
    p_event_id,
    p_event_name,
    v_weight,
    jsonb_build_object(
      'review_id', p_review_id,
      'rating', p_rating
    ),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert one signal per genre (normalized)
  IF p_genres IS NOT NULL AND p_action != 'deleted' THEN
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
        'event',
        p_event_id,
        p_event_name,
        v_weight,
        v_genre,
        jsonb_build_object(
          'review_id', p_review_id,
          'rating', p_rating
        ),
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Insert streaming signal
-- ============================================
CREATE OR REPLACE FUNCTION insert_streaming_signal(
  p_user_id UUID,
  p_signal_type preference_signal_type,
  p_entity_type preference_entity_type,
  p_entity_id UUID,
  p_entity_name TEXT,
  p_genres TEXT[] DEFAULT NULL,
  p_time_range TEXT DEFAULT NULL,
  p_weight NUMERIC(5,2) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genre TEXT;
  v_final_weight NUMERIC(5,2);
BEGIN
  -- Determine weight if not provided
  IF p_weight IS NULL THEN
    CASE p_signal_type
      WHEN 'streaming_top_track_long' THEN v_final_weight := 6.0;
      WHEN 'streaming_top_track_medium' THEN v_final_weight := 5.0;
      WHEN 'streaming_top_track_short' THEN v_final_weight := 4.0;
      WHEN 'streaming_top_artist_long' THEN v_final_weight := 6.0;
      WHEN 'streaming_top_artist_medium' THEN v_final_weight := 5.0;
      WHEN 'streaming_top_artist_short' THEN v_final_weight := 4.0;
      WHEN 'streaming_recent_play' THEN v_final_weight := 3.0;
      WHEN 'streaming_setlist_add' THEN v_final_weight := 4.0;
      ELSE v_final_weight := 3.0;
    END CASE;
  ELSE
    v_final_weight := p_weight;
  END IF;

  -- Insert main signal
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
    p_signal_type,
    p_entity_type,
    p_entity_id,
    p_entity_name,
    v_final_weight,
    jsonb_build_object(
      'time_range', p_time_range
    ),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert one signal per genre (normalized)
  IF p_genres IS NOT NULL THEN
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
        p_signal_type,
        p_entity_type,
        p_entity_id,
        p_entity_name,
        v_final_weight,
        v_genre,
        jsonb_build_object(
          'time_range', p_time_range
        ),
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Insert search signal
-- ============================================
CREATE OR REPLACE FUNCTION insert_search_signal(
  p_user_id UUID,
  p_entity_type preference_entity_type,
  p_search_query TEXT,
  p_genres TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_genre TEXT;
  v_signal_type preference_signal_type;
BEGIN
  -- Determine signal type based on entity type
  CASE p_entity_type
    WHEN 'artist' THEN v_signal_type := 'artist_search';
    WHEN 'event' THEN v_signal_type := 'event_search';
    WHEN 'venue' THEN v_signal_type := 'venue_search';
    WHEN 'genre' THEN v_signal_type := 'genre_search';
    ELSE v_signal_type := 'genre_search';
  END CASE;

  -- Insert main signal
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
    p_entity_type,
    NULL,
    p_search_query,
    2.0,  -- Lower weight for searches (less explicit)
    jsonb_build_object(
      'search_query', p_search_query
    ),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert one signal per genre (normalized)
  IF p_genres IS NOT NULL THEN
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
        p_entity_type,
        NULL,
        p_search_query,
        2.0,
        v_genre,
        jsonb_build_object(
          'search_query', p_search_query
        ),
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION insert_artist_follow_signal TO authenticated;
GRANT EXECUTE ON FUNCTION insert_event_interest_signal TO authenticated;
GRANT EXECUTE ON FUNCTION insert_event_attendance_signal TO authenticated;
GRANT EXECUTE ON FUNCTION insert_review_signal TO authenticated;
GRANT EXECUTE ON FUNCTION insert_streaming_signal TO authenticated;
GRANT EXECUTE ON FUNCTION insert_search_signal TO authenticated;
GRANT EXECUTE ON FUNCTION compute_user_preferences TO authenticated;

