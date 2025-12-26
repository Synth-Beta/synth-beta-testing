-- ============================================
-- REVIEW CONTENT PREFERENCE TRACKING FUNCTIONS
-- ============================================
-- Functions for tracking review content signals (ratings, tags, media)
-- These are called when reviews are created/updated

-- ============================================
-- FUNCTION: Track review rating (overall)
-- ============================================
CREATE OR REPLACE FUNCTION track_review_rating_overall(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_rating NUMERIC  -- 1-5 stars
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

  -- Weight equals rating (1-5)
  v_weight := LEAST(GREATEST(p_rating, 1.0), 5.0);

  -- Insert overall rating signal
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
    'review_rating_overall',
    'review',
    p_review_id,
    v_event_name,
    v_weight,
    v_genres[1],  -- First genre
    jsonb_build_object('review_id', p_review_id, 'rating', p_rating, 'event_id', p_event_id),
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
        'review_rating_overall',
        'review',
        p_review_id,
        v_event_name,
        v_weight,
        v_genre,
        jsonb_build_object('review_id', p_review_id, 'rating', p_rating, 'event_id', p_event_id),
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track category rating
-- ============================================
CREATE OR REPLACE FUNCTION track_review_category_rating(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_category TEXT,  -- 'artist_performance', 'production', 'venue', 'location', 'value'
  p_rating NUMERIC  -- 0.5-5.0
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

  -- Determine signal type based on category
  v_signal_type := CASE p_category
    WHEN 'artist_performance' THEN 'review_rating_artist_performance'::preference_signal_type
    WHEN 'production' THEN 'review_rating_production'::preference_signal_type
    WHEN 'venue' THEN 'review_rating_venue'::preference_signal_type
    WHEN 'location' THEN 'review_rating_location'::preference_signal_type
    WHEN 'value' THEN 'review_rating_value'::preference_signal_type
    ELSE 'review_rating_overall'::preference_signal_type
  END;

  -- Weight equals rating (0.5-5.0)
  v_weight := LEAST(GREATEST(p_rating, 0.5), 5.0);

  -- Insert category rating signal
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
    'review',
    p_review_id,
    v_event_name,
    v_weight,
    v_genres[1],
    jsonb_build_object(
      'review_id', p_review_id,
      'category', p_category,
      'rating', p_rating,
      'event_id', p_event_id
    ),
    now()
  )
  RETURNING id INTO v_signal_id;

  -- Insert genre signals (not for venue/location categories)
  IF p_category NOT IN ('venue', 'location') AND v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
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
        'review',
        p_review_id,
        v_event_name,
        v_weight,
        v_genre,
        jsonb_build_object(
          'review_id', p_review_id,
          'category', p_category,
          'rating', p_rating,
          'event_id', p_event_id
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
-- FUNCTION: Track review reaction emoji
-- ============================================
CREATE OR REPLACE FUNCTION track_review_reaction_emoji(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_emoji TEXT
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

  -- Insert reaction emoji signal
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
    'review_reaction_emoji',
    'review',
    p_review_id,
    v_event_name,
    2.0,
    v_genres[1],
    jsonb_build_object('review_id', p_review_id, 'emoji', p_emoji, 'event_id', p_event_id),
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
        'review_reaction_emoji',
        'review',
        p_review_id,
        v_event_name,
        2.0,
        v_genre,
        jsonb_build_object('review_id', p_review_id, 'emoji', p_emoji, 'event_id', p_event_id),
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track review genre tags
-- ============================================
CREATE OR REPLACE FUNCTION track_review_genre_tags(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_genre_tags TEXT[]
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_ids UUID[] := '{}';
  v_event_name TEXT;
  v_signal_id UUID;
  v_tag TEXT;
BEGIN
  -- Get event name
  SELECT COALESCE(title, artist_name || ' at ' || venue_name) INTO v_event_name
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_name IS NULL THEN
    v_event_name := 'Unknown Event';
  END IF;

  -- Insert one signal per genre tag
  IF p_genre_tags IS NOT NULL AND array_length(p_genre_tags, 1) > 0 THEN
    FOREACH v_tag IN ARRAY p_genre_tags
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
        'review_genre_tags',
        'review',
        p_review_id,
        v_event_name,
        3.0,  -- Per tag
        v_tag,
        jsonb_build_object('review_id', p_review_id, 'tag', v_tag, 'event_id', p_event_id),
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING
      RETURNING id INTO v_signal_id;

      -- Only append if signal was actually inserted (not conflicted)
      IF v_signal_id IS NOT NULL THEN
        v_signal_ids := array_append(v_signal_ids, v_signal_id);
      END IF;
    END LOOP;
  END IF;

  RETURN v_signal_ids;
END;
$$;

-- ============================================
-- FUNCTION: Track review mood tags
-- ============================================
CREATE OR REPLACE FUNCTION track_review_mood_tags(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_mood_tags TEXT[]
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_ids UUID[] := '{}';
  v_event_name TEXT;
  v_event_genres TEXT[];
  v_genre TEXT;
  v_signal_id UUID;
  v_tag TEXT;
BEGIN
  -- Get event details
  SELECT 
    COALESCE(title, artist_name || ' at ' || venue_name) as event_name,
    genres
  INTO v_event_name, v_event_genres
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_name IS NULL THEN
    v_event_name := 'Unknown Event';
  END IF;

  -- Insert one signal per mood tag (with event genres)
  IF p_mood_tags IS NOT NULL AND array_length(p_mood_tags, 1) > 0 THEN
    FOREACH v_tag IN ARRAY p_mood_tags
    LOOP
      -- Insert signal for each event genre
      IF v_event_genres IS NOT NULL AND array_length(v_event_genres, 1) > 0 THEN
        FOREACH v_genre IN ARRAY v_event_genres
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
            'review_mood_tags',
            'review',
            p_review_id,
            v_event_name,
            2.0,
            v_genre,
            jsonb_build_object('review_id', p_review_id, 'mood_tag', v_tag, 'event_id', p_event_id),
            now()
          )
          ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING
          RETURNING id INTO v_signal_id;

          -- Only append if signal was actually inserted (not conflicted)
          IF v_signal_id IS NOT NULL THEN
            v_signal_ids := array_append(v_signal_ids, v_signal_id);
          END IF;
        END LOOP;
      ELSE
        -- No genres, just insert one signal
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
          'review_mood_tags',
          'review',
          p_review_id,
          v_event_name,
          2.0,
          jsonb_build_object('review_id', p_review_id, 'mood_tag', v_tag, 'event_id', p_event_id),
          now()
        )
        ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING
        RETURNING id INTO v_signal_id;

        -- Only append if signal was actually inserted (not conflicted)
        IF v_signal_id IS NOT NULL THEN
          v_signal_ids := array_append(v_signal_ids, v_signal_id);
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_signal_ids;
END;
$$;

-- ============================================
-- FUNCTION: Track review context tags
-- ============================================
CREATE OR REPLACE FUNCTION track_review_context_tags(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_context_tags TEXT[]
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_ids UUID[] := '{}';
  v_event_name TEXT;
  v_event_genres TEXT[];
  v_genre TEXT;
  v_signal_id UUID;
  v_tag TEXT;
BEGIN
  -- Get event details
  SELECT 
    COALESCE(title, artist_name || ' at ' || venue_name) as event_name,
    genres
  INTO v_event_name, v_event_genres
  FROM public.events
  WHERE id = p_event_id;

  IF v_event_name IS NULL THEN
    v_event_name := 'Unknown Event';
  END IF;

  -- Insert one signal per context tag (with event genres)
  IF p_context_tags IS NOT NULL AND array_length(p_context_tags, 1) > 0 THEN
    FOREACH v_tag IN ARRAY p_context_tags
    LOOP
      -- Insert signal for each event genre
      IF v_event_genres IS NOT NULL AND array_length(v_event_genres, 1) > 0 THEN
        FOREACH v_genre IN ARRAY v_event_genres
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
            'review_context_tags',
            'review',
            p_review_id,
            v_event_name,
            2.0,
            v_genre,
            jsonb_build_object('review_id', p_review_id, 'context_tag', v_tag, 'event_id', p_event_id),
            now()
          )
          ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING
          RETURNING id INTO v_signal_id;

          -- Only append if signal was actually inserted (not conflicted)
          IF v_signal_id IS NOT NULL THEN
            v_signal_ids := array_append(v_signal_ids, v_signal_id);
          END IF;
        END LOOP;
      ELSE
        -- No genres, just insert one signal
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
          'review_context_tags',
          'review',
          p_review_id,
          v_event_name,
          2.0,
          jsonb_build_object('review_id', p_review_id, 'context_tag', v_tag, 'event_id', p_event_id),
          now()
        )
        ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING
        RETURNING id INTO v_signal_id;

        -- Only append if signal was actually inserted (not conflicted)
        IF v_signal_id IS NOT NULL THEN
          v_signal_ids := array_append(v_signal_ids, v_signal_id);
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_signal_ids;
END;
$$;

-- ============================================
-- FUNCTION: Track review photos
-- ============================================
CREATE OR REPLACE FUNCTION track_review_photos(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_photo_count INTEGER
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

  -- Weight: 1.0 per photo, max 5.0
  v_weight := LEAST(p_photo_count::NUMERIC, 5.0);

  -- Insert photos signal
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
    'review_photos',
    'review',
    p_review_id,
    v_event_name,
    v_weight,
    v_genres[1],
    jsonb_build_object('review_id', p_review_id, 'photo_count', p_photo_count, 'event_id', p_event_id),
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
        'review_photos',
        'review',
        p_review_id,
        v_event_name,
        v_weight,
        v_genre,
        jsonb_build_object('review_id', p_review_id, 'photo_count', p_photo_count, 'event_id', p_event_id),
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track review videos
-- ============================================
CREATE OR REPLACE FUNCTION track_review_videos(
  p_user_id UUID,
  p_review_id UUID,
  p_event_id UUID,
  p_video_count INTEGER
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

  -- Weight: 2.0 per video, max 6.0
  v_weight := LEAST(p_video_count::NUMERIC * 2.0, 6.0);

  -- Insert videos signal
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
    'review_videos',
    'review',
    p_review_id,
    v_event_name,
    v_weight,
    v_genres[1],
    jsonb_build_object('review_id', p_review_id, 'video_count', p_video_count, 'event_id', p_event_id),
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
        'review_videos',
        'review',
        p_review_id,
        v_event_name,
        v_weight,
        v_genre,
        jsonb_build_object('review_id', p_review_id, 'video_count', p_video_count, 'event_id', p_event_id),
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
GRANT EXECUTE ON FUNCTION track_review_rating_overall TO authenticated;
GRANT EXECUTE ON FUNCTION track_review_category_rating TO authenticated;
GRANT EXECUTE ON FUNCTION track_review_reaction_emoji TO authenticated;
GRANT EXECUTE ON FUNCTION track_review_genre_tags TO authenticated;
GRANT EXECUTE ON FUNCTION track_review_mood_tags TO authenticated;
GRANT EXECUTE ON FUNCTION track_review_context_tags TO authenticated;
GRANT EXECUTE ON FUNCTION track_review_photos TO authenticated;
GRANT EXECUTE ON FUNCTION track_review_videos TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION track_review_rating_overall IS 'Tracks overall review rating (1-5 stars). Weight: rating value';
COMMENT ON FUNCTION track_review_category_rating IS 'Tracks category rating (artist_performance, production, venue, location, value). Weight: rating value (0.5-5.0)';
COMMENT ON FUNCTION track_review_reaction_emoji IS 'Tracks review reaction emoji. Weight: 2.0';
COMMENT ON FUNCTION track_review_genre_tags IS 'Tracks genre tags added to review. Weight: 3.0 per tag';
COMMENT ON FUNCTION track_review_mood_tags IS 'Tracks mood tags added to review. Weight: 2.0 per tag';
COMMENT ON FUNCTION track_review_context_tags IS 'Tracks context tags added to review. Weight: 2.0 per tag';
COMMENT ON FUNCTION track_review_photos IS 'Tracks photos uploaded to review. Weight: 1.0 per photo (max 5.0)';
COMMENT ON FUNCTION track_review_videos IS 'Tracks videos uploaded to review. Weight: 2.0 per video (max 6.0)';

