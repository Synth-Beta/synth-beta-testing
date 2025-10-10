-- ============================================================
-- TRIGGER 2: Event Interest -> Capture Music Data for User UUID
-- Captures artist, genres, and venue from event interest
-- ============================================================

CREATE OR REPLACE FUNCTION capture_event_interest_music_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_event_record RECORD;
  v_genre TEXT;
BEGIN
  -- Get event data with all music metadata
  SELECT 
    e.id,
    e.title,
    e.artist_name,
    e.artist_id,
    COALESCE(e.genres, ARRAY[]::TEXT[]) as genres,
    e.venue_name,
    e.venue_id,
    e.tour_name,
    e.event_date
  INTO v_event_record
  FROM jambase_events e
  WHERE e.id = NEW.jambase_event_id;
  
  -- Insert artist interaction FOR THIS USER
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
      'interest',
      6,
      v_event_record.genres,
      'event_interest',
      NEW.id::TEXT,
      jsonb_build_object(
        'event_id', v_event_record.id,
        'event_title', v_event_record.title,
        'event_date', v_event_record.event_date,
        'venue', v_event_record.venue_name,
        'tour', v_event_record.tour_name
      ),
      NEW.created_at
    );
  END IF;
  
  -- Insert genre interactions FOR THIS USER
  IF array_length(v_event_record.genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_event_record.genres) LOOP
      INSERT INTO user_genre_interactions (
        user_id,
        genre,
        interaction_type,
        interaction_count,
        artist_names,
        source_entity_type,
        source_entity_id,
        metadata,
        occurred_at
      ) VALUES (
        NEW.user_id,
        v_genre,
        'interest',
        1,
        ARRAY[v_event_record.artist_name],
        'event_interest',
        NEW.id::TEXT,
        jsonb_build_object('event_id', v_event_record.id),
        NEW.created_at
      );
    END LOOP;
  END IF;
  
  -- Insert venue interaction FOR THIS USER
  IF v_event_record.venue_id IS NOT NULL THEN
    INSERT INTO user_venue_interactions (
      user_id,
      venue_id,
      venue_name,
      interaction_type,
      interaction_strength,
      typical_genres,
      artists_seen_here,
      source_entity_type,
      source_entity_id,
      occurred_at
    ) VALUES (
      NEW.user_id,
      v_event_record.venue_id,
      v_event_record.venue_name,
      'interest',
      5,
      v_event_record.genres,
      ARRAY[v_event_record.artist_name],
      'event_interest',
      NEW.id::TEXT,
      NEW.created_at
    );
  END IF;
  
  -- Update artist preference signal FOR THIS USER
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
      6.0, 
      1, 
      jsonb_build_object('interest', 1),
      NEW.created_at, 
      NEW.created_at, 
      0.65
    )
    ON CONFLICT (user_id, preference_type, preference_value)
    DO UPDATE SET
      preference_score = music_preference_signals.preference_score + 6.0,
      interaction_count = music_preference_signals.interaction_count + 1,
      last_interaction = NEW.created_at,
      updated_at = now();
  END IF;
  
  -- Update genre preference signals FOR THIS USER
  IF array_length(v_event_record.genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_event_record.genres) LOOP
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
        4.0, 
        1, 
        jsonb_build_object('interest', 1),
        NEW.created_at, 
        NEW.created_at, 
        0.55
      )
      ON CONFLICT (user_id, preference_type, preference_value)
      DO UPDATE SET
        preference_score = music_preference_signals.preference_score + 4.0,
        interaction_count = music_preference_signals.interaction_count + 1,
        last_interaction = NEW.created_at,
        updated_at = now();
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_capture_event_interest_music ON user_jambase_events;
CREATE TRIGGER trigger_capture_event_interest_music
AFTER INSERT ON user_jambase_events
FOR EACH ROW
EXECUTE FUNCTION capture_event_interest_music_data();

-- Add comment
COMMENT ON FUNCTION capture_event_interest_music_data() IS 'Captures music metadata when user shows interest in event, mapped to user UUID';

