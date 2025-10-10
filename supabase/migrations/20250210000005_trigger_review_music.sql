-- ============================================================
-- TRIGGER 3: Review -> Capture Music Data for User UUID
-- Captures artist, genres, songs from reviews (strongest signal)
-- ============================================================

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
BEGIN
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
  
  -- Combine event genres with review genre tags
  v_all_genres := v_event_record.genres || COALESCE(NEW.genre_tags, ARRAY[]::TEXT[]);
  
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
      v_event_record.artist_id,
      v_event_record.artist_name,
      'review',
      9,
      v_all_genres,
      'review',
      NEW.id::TEXT,
      jsonb_build_object(
        'rating', NEW.rating,
        'performance_rating', NEW.performance_rating,
        'has_photos', (NEW.photos IS NOT NULL AND array_length(NEW.photos, 1) > 0),
        'has_custom_setlist', (NEW.custom_setlist IS NOT NULL AND array_length(NEW.custom_setlist, 1) > 0)
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
  IF NEW.custom_setlist IS NOT NULL AND array_length(NEW.custom_setlist, 1) > 0 THEN
    FOR v_song IN SELECT unnest(NEW.custom_setlist) LOOP
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

-- Create trigger
DROP TRIGGER IF EXISTS trigger_capture_review_music ON user_reviews;
CREATE TRIGGER trigger_capture_review_music
AFTER INSERT OR UPDATE ON user_reviews
FOR EACH ROW
EXECUTE FUNCTION capture_review_music_data();

-- Add comment
COMMENT ON FUNCTION capture_review_music_data() IS 'Captures music metadata from user reviews (strongest signal), mapped to user UUID';

