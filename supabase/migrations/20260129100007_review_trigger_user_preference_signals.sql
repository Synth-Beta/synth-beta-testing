-- ============================================================
-- REVIEW TRIGGER: write to user_preference_signals with normalized genre
-- Personalization engine v5: replace music_preference_signals with user_preference_signals
-- ============================================================

CREATE OR REPLACE FUNCTION capture_review_music_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event_record RECORD;
  v_song TEXT;
  v_genre TEXT;
  v_all_genres TEXT[];
  v_review_row JSONB;
  v_review_genre_tags TEXT[] := ARRAY[]::TEXT[];
  v_rating NUMERIC;
  v_artist_performance_rating NUMERIC;
  v_production_rating NUMERIC;
  v_venue_rating NUMERIC;
  v_location_rating NUMERIC;
  v_value_rating NUMERIC;
  v_ticket_price NUMERIC;
  v_has_photos BOOLEAN := FALSE;
  v_custom_setlist JSONB;
  v_artist_uuid UUID;
  v_genre_name TEXT;
  v_cluster_slug TEXT;
  v_normalized_key TEXT;
  v_occurred_at timestamptz;
  v_genre_ord int := 0;
BEGIN
  IF NEW.is_draft THEN
    RETURN NEW;
  END IF;

  SELECT 
    e.id, 
    a.name as artist_name,
    e.artist_id,
    COALESCE(e.genres, ARRAY[]::TEXT[]) as genres,
    v.name as venue_name,
    e.venue_id,
    e.event_date
  INTO v_event_record
  FROM public.events e
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  WHERE e.id = NEW.event_id;

  v_artist_uuid := v_event_record.artist_id;
  v_review_row := to_jsonb(NEW);

  IF v_review_row ? 'genre_tags' AND jsonb_typeof(v_review_row->'genre_tags') = 'array' THEN
    SELECT array_agg(elem.value)
    INTO v_review_genre_tags
    FROM jsonb_array_elements_text(v_review_row->'genre_tags') AS elem(value);
  END IF;

  v_all_genres := v_event_record.genres || COALESCE(v_review_genre_tags, ARRAY[]::TEXT[]);

  v_rating := NULLIF(v_review_row->>'rating', '')::NUMERIC;
  v_artist_performance_rating := NULLIF(v_review_row->>'artist_performance_rating', '')::NUMERIC;
  v_production_rating := NULLIF(v_review_row->>'production_rating', '')::NUMERIC;
  v_venue_rating := NULLIF(v_review_row->>'venue_rating', '')::NUMERIC;
  v_location_rating := NULLIF(v_review_row->>'location_rating', '')::NUMERIC;
  v_value_rating := NULLIF(v_review_row->>'value_rating', '')::NUMERIC;
  v_ticket_price := NULLIF(v_review_row->>'ticket_price_paid', '')::NUMERIC;

  IF (v_review_row ? 'photos') THEN
    v_has_photos := jsonb_typeof(v_review_row->'photos') = 'array'
      AND jsonb_array_length(v_review_row->'photos') > 0;
  END IF;

  IF (v_review_row ? 'custom_setlist') THEN
    v_custom_setlist := v_review_row->'custom_setlist';
    IF jsonb_typeof(v_custom_setlist) = 'array' THEN
      IF jsonb_array_length(v_custom_setlist) = 0 THEN
        v_custom_setlist := NULL;
      END IF;
    ELSE
      v_custom_setlist := NULL;
    END IF;
  END IF;

  -- Keep existing user_artist_interactions and user_genre_interactions for aggregation
  IF v_event_record.artist_name IS NOT NULL THEN
    INSERT INTO user_artist_interactions (
      user_id, artist_id, artist_name, interaction_type, interaction_strength,
      genres, source_entity_type, source_entity_id, metadata, occurred_at
    ) VALUES (
      NEW.user_id, v_artist_uuid, v_event_record.artist_name, 'review', 9,
      v_all_genres, 'review', NEW.id::TEXT,
      jsonb_build_object(
        'rating', v_rating, 'artist_performance_rating', v_artist_performance_rating,
        'production_rating', v_production_rating, 'venue_rating', v_venue_rating,
        'location_rating', v_location_rating, 'value_rating', v_value_rating,
        'ticket_price_paid', v_ticket_price, 'has_photos', v_has_photos,
        'has_custom_setlist', v_custom_setlist IS NOT NULL
      ),
      NEW.created_at
    );
  END IF;

  IF array_length(v_all_genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_all_genres) LOOP
      INSERT INTO user_genre_interactions (
        user_id, genre, interaction_type, interaction_count, artist_names,
        source_entity_type, source_entity_id, occurred_at
      ) VALUES (
        NEW.user_id, v_genre, 'review', 1, ARRAY[v_event_record.artist_name],
        'review', NEW.id::TEXT, NEW.created_at
      );
    END LOOP;
  END IF;

  IF v_custom_setlist IS NOT NULL THEN
    FOR v_song IN
      SELECT COALESCE(elem->>'title', elem->>'name', elem->>'song', NULLIF(trim(both '"' FROM elem::TEXT), ''))
      FROM jsonb_array_elements(v_custom_setlist) elem
    LOOP
      CONTINUE WHEN v_song IS NULL OR v_song = '';
      INSERT INTO user_song_interactions (
        user_id, song_id, song_name, artist_names, genres,
        interaction_type, source_entity_type, source_entity_id, occurred_at
      ) VALUES (
        NEW.user_id, md5(v_song || v_event_record.artist_name), v_song,
        ARRAY[v_event_record.artist_name], v_event_record.genres,
        'custom_setlist_added', 'review', NEW.id::TEXT, NEW.created_at
      );
    END LOOP;
  END IF;

  -- Personalization engine v5: insert into user_preference_signals (normalized genre, cluster)
  IF v_event_record.artist_name IS NOT NULL AND v_artist_uuid IS NOT NULL THEN
    SELECT g.name, (SELECT ck.cluster_path_slug FROM public.genre_cluster_keys ck WHERE ck.genre_id = g.id LIMIT 1)
    INTO v_genre_name, v_cluster_slug
    FROM public.artists_genres ag
    JOIN public.genres g ON g.id = ag.genre_id
    WHERE ag.artist_id = v_artist_uuid
    ORDER BY v_cluster_slug NULLS LAST
    LIMIT 1;

    INSERT INTO public.user_preference_signals (
      user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      'review'::public.preference_signal_type,
      'artist'::public.preference_entity_type,
      v_artist_uuid,
      v_event_record.artist_name,
      3.0,
      v_genre_name,
      jsonb_build_object('source', 'review', 'review_id', NEW.id) || CASE WHEN v_cluster_slug IS NOT NULL THEN jsonb_build_object('cluster_path_slug', v_cluster_slug) ELSE '{}'::jsonb END,
      NEW.created_at,
      NEW.created_at,
      now()
    )
    ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
    DO UPDATE SET
      signal_weight = GREATEST(user_preference_signals.signal_weight, 3.0),
      context = user_preference_signals.context || jsonb_build_object('review', true),
      updated_at = now();
  END IF;

  IF array_length(v_all_genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_all_genres) LOOP
      v_genre_ord := v_genre_ord + 1;
      v_occurred_at := NEW.created_at + (v_genre_ord * interval '1 millisecond');
      v_normalized_key := lower(trim(regexp_replace(v_genre, '[-_\s]+', ' ', 'g')));
      SELECT g.name, (SELECT ck.cluster_path_slug FROM public.genre_cluster_keys ck WHERE ck.genre_id = g.id LIMIT 1)
      INTO v_genre_name, v_cluster_slug
      FROM public.genres g
      WHERE g.normalized_key = v_normalized_key
      LIMIT 1;
      v_genre_name := COALESCE(v_genre_name, v_genre);

      INSERT INTO public.user_preference_signals (
        user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
      ) VALUES (
        NEW.user_id,
        'review'::public.preference_signal_type,
        'genre'::public.preference_entity_type,
        NULL,
        v_genre_name,
        2.0,
        v_genre_name,
        jsonb_build_object('source', 'review', 'review_id', NEW.id) || CASE WHEN v_cluster_slug IS NOT NULL THEN jsonb_build_object('cluster_path_slug', v_cluster_slug) ELSE '{}'::jsonb END,
        v_occurred_at,
        NEW.created_at,
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
      DO UPDATE SET
        signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
        context = user_preference_signals.context || jsonb_build_object('review', true),
        updated_at = now();
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION capture_review_music_data() IS 
  'Captures music metadata from user reviews. Writes to user_artist_interactions, user_genre_interactions, user_song_interactions and user_preference_signals (personalization engine v5) with normalized genre and cluster_path_slug.';
