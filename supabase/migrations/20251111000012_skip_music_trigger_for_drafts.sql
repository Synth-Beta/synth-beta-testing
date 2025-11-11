BEGIN;

CREATE OR REPLACE FUNCTION capture_review_music_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
  -- Skip drafts entirely to avoid polluting music signals
  IF NEW.is_draft THEN
    RETURN NEW;
  END IF;

  -- Get event data
  SELECT 
    e.id, 
    e.artist_name, 
    e.artist_id,
    COALESCE(e.genres, ARRAY[]::TEXT[]) as genres,
    e.venue_name, 
    e.venue_id, 
    e.event_date
  INTO v_event_record
  FROM jambase_events e
  WHERE e.id = NEW.event_id;
  
  -- Safely derive an artist UUID when available
  v_artist_uuid := NULL;
  IF v_event_record.artist_id IS NOT NULL AND v_event_record.artist_id <> '' THEN
    BEGIN
      v_artist_uuid := v_event_record.artist_id::uuid;
    EXCEPTION WHEN others THEN
      v_artist_uuid := NULL;
    END;
  END IF;
  
  -- Snapshot the review row as JSONB to safely access optional fields
  v_review_row := to_jsonb(NEW);

  -- Extract review genre tags if present
  IF v_review_row ? 'genre_tags' AND jsonb_typeof(v_review_row->'genre_tags') = 'array' THEN
    SELECT array_agg(elem.value)
    INTO v_review_genre_tags
    FROM jsonb_array_elements_text(v_review_row->'genre_tags') AS elem(value);
  END IF;

  -- Combine event genres with review genre tags
  v_all_genres := v_event_record.genres || COALESCE(v_review_genre_tags, ARRAY[]::TEXT[]);

  -- Extract numeric rating details if present
  v_rating := NULLIF(v_review_row->>'rating', '')::NUMERIC;
  v_artist_performance_rating := NULLIF(v_review_row->>'artist_performance_rating', '')::NUMERIC;
  v_production_rating := NULLIF(v_review_row->>'production_rating', '')::NUMERIC;
  v_venue_rating := NULLIF(v_review_row->>'venue_rating', '')::NUMERIC;
  v_location_rating := NULLIF(v_review_row->>'location_rating', '')::NUMERIC;
  v_value_rating := NULLIF(v_review_row->>'value_rating', '')::NUMERIC;
  v_ticket_price := NULLIF(v_review_row->>'ticket_price_paid', '')::NUMERIC;

  -- Determine if photos/custom setlist exist
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
  
  -- Insert artist interaction FOR THIS USER (reviews are strongest signal)
  IF v_event_record.artist_name IS NOT NULL THEN
    INSERT INTO user_artist_interactions (
      user_id,
      artist_id,
      artist_name,
      interaction_type,
      interaction_strength,
      genres,
      source_entity_type,
      source_entity_id,
      metadata,
      occurred_at
    ) VALUES (
      NEW.user_id,
      v_artist_uuid,
      v_event_record.artist_name,
      'review',
      9,
      v_all_genres,
      'review',
      NEW.id::TEXT,
      jsonb_build_object(
        'rating', v_rating,
        'artist_performance_rating', v_artist_performance_rating,
        'production_rating', v_production_rating,
        'venue_rating', v_venue_rating,
        'location_rating', v_location_rating,
        'value_rating', v_value_rating,
        'ticket_price_paid', v_ticket_price,
        'has_photos', v_has_photos,
        'has_custom_setlist', v_custom_setlist IS NOT NULL
      ),
      NEW.created_at
    );
  END IF;
  
  -- Insert genre interactions FOR THIS USER (from event + review tags)
  IF array_length(v_all_genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_all_genres) LOOP
      INSERT INTO user_genre_interactions (
        user_id,
        genre,
        interaction_type,
        interaction_count,
        artist_names,
        source_entity_type,
        source_entity_id,
        occurred_at
      ) VALUES (
        NEW.user_id,
        v_genre,
        'review',
        1,
        ARRAY[v_event_record.artist_name],
        'review',
        NEW.id::TEXT,
        NEW.created_at
      );
    END LOOP;
  END IF;
  
  -- Insert song interactions FOR THIS USER (from custom setlist)
  IF v_custom_setlist IS NOT NULL THEN
    FOR v_song IN
      SELECT
        COALESCE(
          elem->>'title',
          elem->>'name',
          elem->>'song',
          NULLIF(trim(both '"' FROM elem::TEXT), '')
        )
      FROM jsonb_array_elements(v_custom_setlist) elem
    LOOP
      CONTINUE WHEN v_song IS NULL OR v_song = '';
      INSERT INTO user_song_interactions (
        user_id,
        song_id,
        song_name,
        artist_names,
        genres,
        interaction_type,
        source_entity_type,
        source_entity_id,
        occurred_at
      ) VALUES (
        NEW.user_id,
        md5(v_song || v_event_record.artist_name),
        v_song,
        ARRAY[v_event_record.artist_name],
        v_event_record.genres,
        'custom_setlist_added',
        'review',
        NEW.id::TEXT,
        NEW.created_at
      );
    END LOOP;
  END IF;
  
  -- Update artist preference signal FOR THIS USER (highest weight for reviews)
  IF v_event_record.artist_name IS NOT NULL THEN
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
      v_event_record.artist_name,
      15.0, 
      1, 
      jsonb_build_object('review', 1),
      NEW.created_at, 
      NEW.created_at, 
      0.95
    )
    ON CONFLICT (user_id, preference_type, preference_value)
    DO UPDATE SET
      preference_score = music_preference_signals.preference_score + 15.0,
      interaction_count = music_preference_signals.interaction_count + 1,
      last_interaction = NEW.created_at,
      updated_at = now();
  END IF;
  
  -- Update genre preference signals FOR THIS USER
  IF array_length(v_all_genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_all_genres) LOOP
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
        10.0,
        1,
        jsonb_build_object('review', 1),
        NEW.created_at,
        NEW.created_at,
        0.9
      )
      ON CONFLICT (user_id, preference_type, preference_value)
      DO UPDATE SET
        preference_score = music_preference_signals.preference_score + 10.0,
        interaction_count = music_preference_signals.interaction_count + 1,
        last_interaction = NEW.created_at,
        updated_at = now();
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

COMMIT;
