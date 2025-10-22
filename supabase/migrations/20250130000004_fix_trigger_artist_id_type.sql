-- Fix the trigger to use the correct field for JamBase artist IDs
-- The issue is that artist_id expects UUID but we're passing TEXT from JamBase

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
      artist_id,           -- This should be NULL since we don't have UUID
      artist_name,
      jambase_artist_id,   -- Use this field for JamBase artist ID
      interaction_type,
      interaction_strength,
      genres,
      source_entity_type,
      source_entity_id,
      metadata,
      occurred_at
    ) VALUES (
      NEW.user_id,
      NULL,                    -- artist_id is NULL since we don't have UUID
      v_event_record.artist_name,
      v_event_record.artist_id, -- Use jambase_artist_id field instead
      'interest',
      6,
      v_event_record.genres,
      'event_interest',
      NEW.jambase_event_id,
      jsonb_build_object(
        'event_title', v_event_record.title,
        'venue_name', v_event_record.venue_name,
        'venue_id', v_event_record.venue_id,
        'tour_name', v_event_record.tour_name,
        'event_date', v_event_record.event_date
      ),
      NOW()
    )
    ON CONFLICT (user_id, artist_name, interaction_type, source_entity_type, source_entity_id)
    DO UPDATE SET
      interaction_strength = GREATEST(user_artist_interactions.interaction_strength, 6),
      genres = v_event_record.genres,
      metadata = jsonb_build_object(
        'event_title', v_event_record.title,
        'venue_name', v_event_record.venue_name,
        'venue_id', v_event_record.venue_id,
        'tour_name', v_event_record.tour_name,
        'event_date', v_event_record.event_date
      ),
      occurred_at = NOW();
  END IF;
  
  -- Insert venue interaction FOR THIS USER
  IF v_event_record.venue_name IS NOT NULL THEN
    INSERT INTO user_venue_interactions (
      user_id,
      venue_id,
      venue_name,
      jambase_venue_id,
      interaction_type,
      interaction_strength,
      source_entity_type,
      source_entity_id,
      metadata,
      occurred_at
    ) VALUES (
      NEW.user_id,
      NULL,                    -- venue_id is NULL since we don't have UUID
      v_event_record.venue_name,
      v_event_record.venue_id, -- Use jambase_venue_id field instead
      'interest',
      6,
      'event_interest',
      NEW.jambase_event_id,
      jsonb_build_object(
        'event_title', v_event_record.title,
        'artist_name', v_event_record.artist_name,
        'artist_id', v_event_record.artist_id,
        'tour_name', v_event_record.tour_name,
        'event_date', v_event_record.event_date
      ),
      NOW()
    )
    ON CONFLICT (user_id, venue_name, interaction_type, source_entity_type, source_entity_id)
    DO UPDATE SET
      interaction_strength = GREATEST(user_venue_interactions.interaction_strength, 6),
      metadata = jsonb_build_object(
        'event_title', v_event_record.title,
        'artist_name', v_event_record.artist_name,
        'artist_id', v_event_record.artist_id,
        'tour_name', v_event_record.tour_name,
        'event_date', v_event_record.event_date
      ),
      occurred_at = NOW();
  END IF;
  
  -- Insert genre interactions FOR THIS USER
  IF v_event_record.genres IS NOT NULL AND array_length(v_event_record.genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY v_event_record.genres
    LOOP
      INSERT INTO user_genre_interactions (
        user_id,
        genre,
        interaction_type,
        interaction_strength,
        source_entity_type,
        source_entity_id,
        metadata,
        occurred_at
      ) VALUES (
        NEW.user_id,
        v_genre,
        'interest',
        6,
        'event_interest',
        NEW.jambase_event_id,
        jsonb_build_object(
          'event_title', v_event_record.title,
          'artist_name', v_event_record.artist_name,
          'artist_id', v_event_record.artist_id,
          'venue_name', v_event_record.venue_name,
          'venue_id', v_event_record.venue_id,
          'tour_name', v_event_record.tour_name,
          'event_date', v_event_record.event_date
        ),
        NOW()
      )
      ON CONFLICT (user_id, genre, interaction_type, source_entity_type, source_entity_id)
      DO UPDATE SET
        interaction_strength = GREATEST(user_genre_interactions.interaction_strength, 6),
        metadata = jsonb_build_object(
          'event_title', v_event_record.title,
          'artist_name', v_event_record.artist_name,
          'artist_id', v_event_record.artist_id,
          'venue_name', v_event_record.venue_name,
          'venue_id', v_event_record.venue_id,
          'tour_name', v_event_record.tour_name,
          'event_date', v_event_record.event_date
        ),
        occurred_at = NOW();
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;
