-- ============================================
-- EVENT PREFERENCE TRACKING FUNCTIONS
-- ============================================
-- Functions for tracking all event-related preference signals
-- Grouped: interest, attendance, review, search, ticket click

-- ============================================
-- FUNCTION: Track event interest (mark as interested)
-- ============================================
CREATE OR REPLACE FUNCTION track_event_interest(
  p_user_id UUID,
  p_event_id UUID,
  p_is_interested BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_event_name TEXT;
  v_genres TEXT[];
  v_genre TEXT;
  v_signal_type preference_signal_type;
  v_weight NUMERIC(5,2);
BEGIN
  -- Get event details
  SELECT 
    COALESCE(title, artist_name || ' at ' || venue_name) as event_name,
    genres
  INTO v_event_name, v_genres
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_name IS NULL THEN
    v_event_name := 'Unknown Event';
  END IF;

  -- Determine signal type and weight
  IF p_is_interested THEN
    v_signal_type := 'event_interest';
    v_weight := 5.0;
  ELSE
    v_signal_type := 'event_interest_removed';
    v_weight := -2.0;
  END IF;

  -- Insert main event interest signal
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
    v_event_name,
    v_weight,
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals (only for positive interest)
  IF p_is_interested AND v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
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
        v_signal_type,
        'event',
        p_event_id,
        v_event_name,
        v_weight,
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
-- FUNCTION: Track event attendance
-- ============================================
CREATE OR REPLACE FUNCTION track_event_attendance(
  p_user_id UUID,
  p_event_id UUID,
  p_was_there BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_event_name TEXT;
  v_genres TEXT[];
  v_genre TEXT;
  v_signal_type preference_signal_type;
  v_weight NUMERIC(5,2);
BEGIN
  -- Get event details
  SELECT 
    COALESCE(title, artist_name || ' at ' || venue_name) as event_name,
    genres
  INTO v_event_name, v_genres
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_name IS NULL THEN
    v_event_name := 'Unknown Event';
  END IF;

  -- Determine signal type and weight
  IF p_was_there THEN
    v_signal_type := 'event_attendance';
    v_weight := 10.0;  -- Highest weight
  ELSE
    v_signal_type := 'event_attendance_removed';
    v_weight := -3.0;
  END IF;

  -- Insert main attendance signal
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
    v_event_name,
    v_weight,
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals (only for positive attendance)
  IF p_was_there AND v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
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
        v_signal_type,
        'event',
        p_event_id,
        v_event_name,
        v_weight,
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
-- FUNCTION: Track event review
-- ============================================
CREATE OR REPLACE FUNCTION track_event_review(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_rating NUMERIC DEFAULT NULL,
  p_action TEXT DEFAULT 'created'  -- 'created', 'updated', 'deleted'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_event_name TEXT;
  v_genres TEXT[];
  v_genre TEXT;
  v_signal_type preference_signal_type;
  v_weight NUMERIC(5,2);
BEGIN
  -- Get event details
  SELECT 
    COALESCE(title, artist_name || ' at ' || venue_name) as event_name,
    genres
  INTO v_event_name, v_genres
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_name IS NULL THEN
    v_event_name := 'Unknown Event';
  END IF;

  -- Determine signal type and weight
  CASE p_action
    WHEN 'created' THEN
      v_signal_type := 'event_review_created';
      v_weight := 8.0;
    WHEN 'updated' THEN
      v_signal_type := 'event_review_updated';
      v_weight := 6.0;
    WHEN 'deleted' THEN
      v_signal_type := 'event_review_deleted';
      v_weight := -4.0;
    ELSE
      v_signal_type := 'event_review_created';
      v_weight := 8.0;
  END CASE;

  -- Adjust weight by rating (only for created/updated)
  IF p_rating IS NOT NULL AND p_action != 'deleted' THEN
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
    v_signal_type,
    'event',
    p_event_id,
    v_event_name,
    v_weight,
    jsonb_build_object('review_id', p_review_id, 'rating', p_rating),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals (not for deleted)
  IF p_action != 'deleted' AND v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
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
        v_signal_type,
        'event',
        p_event_id,
        v_event_name,
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
-- FUNCTION: Track event search
-- ============================================
CREATE OR REPLACE FUNCTION track_event_search(
  p_user_id UUID,
  p_search_query TEXT,
  p_event_id UUID DEFAULT NULL,
  p_genres TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_event_name TEXT;
  v_genres TEXT[];
  v_genre TEXT;
BEGIN
  -- Get event details if event_id provided
  IF p_event_id IS NOT NULL THEN
    SELECT 
      COALESCE(title, artist_name || ' at ' || venue_name) as event_name,
      genres
    INTO v_event_name, v_genres
    FROM public.events
    WHERE id = p_event_id;
  END IF;

  -- Use provided genres or event genres
  IF p_genres IS NOT NULL THEN
    v_genres := p_genres;
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
    'event_search',
    'event',
    p_event_id,
    COALESCE(v_event_name, p_search_query),
    2.0,
    jsonb_build_object('search_query', p_search_query),
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
        'event_search',
        'event',
        p_event_id,
        COALESCE(v_event_name, p_search_query),
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
-- FUNCTION: Track ticket link click
-- ============================================
CREATE OR REPLACE FUNCTION track_event_ticket_click(
  p_user_id UUID,
  p_event_id UUID,
  p_ticket_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_event_name TEXT;
  v_genres TEXT[];
  v_genre TEXT;
BEGIN
  -- Get event details
  SELECT 
    COALESCE(title, artist_name || ' at ' || venue_name) as event_name,
    genres
  INTO v_event_name, v_genres
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_name IS NULL THEN
    v_event_name := 'Unknown Event';
  END IF;

  -- Insert main ticket click signal
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
    'event_ticket_click',
    'event',
    p_event_id,
    v_event_name,
    4.0,  -- Purchase intent
    v_genres[1],  -- First genre
    jsonb_build_object('ticket_url', p_ticket_url),
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
        'event_ticket_click',
        'event',
        p_event_id,
        v_event_name,
        4.0,
        v_genre,
        jsonb_build_object('ticket_url', p_ticket_url),
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
GRANT EXECUTE ON FUNCTION track_event_interest TO authenticated;
GRANT EXECUTE ON FUNCTION track_event_attendance TO authenticated;
GRANT EXECUTE ON FUNCTION track_event_review TO authenticated;
GRANT EXECUTE ON FUNCTION track_event_search TO authenticated;
GRANT EXECUTE ON FUNCTION track_event_ticket_click TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION track_event_interest IS 'Tracks event interest/removal. Weight: 5.0 / -2.0';
COMMENT ON FUNCTION track_event_attendance IS 'Tracks event attendance (highest weight). Weight: 10.0 / -3.0';
COMMENT ON FUNCTION track_event_review IS 'Tracks event review creation/update/deletion. Weight: 8.0/6.0/-4.0 (scaled by rating)';
COMMENT ON FUNCTION track_event_search IS 'Tracks event search. Weight: 2.0';
COMMENT ON FUNCTION track_event_ticket_click IS 'Tracks ticket link click (purchase intent). Weight: 4.0';

