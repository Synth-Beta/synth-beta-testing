-- ============================================================
-- TRIGGER 1: Artist Follow -> Capture Music Data for User UUID
-- Captures artist metadata, genres, and updates preference signals
-- ============================================================

CREATE OR REPLACE FUNCTION capture_artist_follow_music_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_artist_record RECORD;
  v_genre TEXT;
BEGIN
  -- Get artist data with genres
  SELECT 
    a.id, 
    a.name, 
    a.jambase_artist_id,
    COALESCE(ap.genres, ARRAY[]::TEXT[]) as genres,
    ap.num_upcoming_events
  INTO v_artist_record
  FROM artists a
  LEFT JOIN artist_profile ap ON ap.jambase_artist_id = a.jambase_artist_id
  WHERE a.id = NEW.artist_id;
  
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
      );
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

-- Create trigger
DROP TRIGGER IF EXISTS trigger_capture_artist_follow_music ON artist_follows;
CREATE TRIGGER trigger_capture_artist_follow_music
AFTER INSERT ON artist_follows
FOR EACH ROW
EXECUTE FUNCTION capture_artist_follow_music_data();

-- Add comment
COMMENT ON FUNCTION capture_artist_follow_music_data() IS 'Captures music metadata when user follows an artist, mapped to user UUID';

