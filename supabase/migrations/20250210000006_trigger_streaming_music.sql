-- ============================================================
-- TRIGGER 4: Streaming Profile -> Capture Music Data for User UUID
-- Extracts artists, tracks, genres from Spotify/Apple Music
-- ============================================================

CREATE OR REPLACE FUNCTION capture_streaming_music_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_artist JSONB;
  v_track JSONB;
  v_genre TEXT;
  v_artist_name TEXT;
  v_artist_id TEXT;
BEGIN
  -- Extract Spotify top artists FOR THIS USER
  IF NEW.service_type = 'spotify' AND NEW.profile_data ? 'topArtists' THEN
    FOR v_artist IN SELECT jsonb_array_elements(NEW.profile_data->'topArtists') LOOP
      v_artist_name := v_artist->>'name';
      v_artist_id := v_artist->>'id';
      
      IF v_artist_name IS NOT NULL THEN
        -- Insert artist interaction
        INSERT INTO user_artist_interactions (
          user_id,
          artist_name,
          spotify_artist_id,
          interaction_type,
          interaction_strength,
          genres,
          popularity_score,
          source_entity_type,
          source_entity_id,
          metadata,
          occurred_at
        ) VALUES (
          NEW.user_id,
          v_artist_name,
          v_artist_id,
          'streaming_top',
          8,
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_artist->'genres', '[]'::jsonb))),
          (v_artist->>'popularity')::INT,
          'streaming_profile',
          NEW.id::TEXT,
          v_artist,
          NEW.last_updated
        );
        
        -- Insert genre interactions
        IF v_artist ? 'genres' THEN
          FOR v_genre IN SELECT jsonb_array_elements_text(v_artist->'genres') LOOP
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
              'streaming_top',
              1,
              ARRAY[v_artist_name],
              'streaming_profile',
              NEW.id::TEXT,
              NEW.last_updated
            );
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  -- Extract Spotify top tracks FOR THIS USER
  IF NEW.service_type = 'spotify' AND NEW.profile_data ? 'topTracks' THEN
    FOR v_track IN SELECT jsonb_array_elements(NEW.profile_data->'topTracks') LOOP
      INSERT INTO user_song_interactions (
        user_id,
        song_id,
        song_name,
        artist_names,
        artist_ids,
        album_name,
        popularity_score,
        duration_ms,
        interaction_type,
        source_entity_type,
        source_entity_id,
        metadata,
        occurred_at
      ) VALUES (
        NEW.user_id,
        v_track->>'id',
        v_track->>'name',
        ARRAY(SELECT jsonb_array_elements(COALESCE(v_track->'artists', '[]'::jsonb))->>'name'),
        ARRAY(SELECT jsonb_array_elements(COALESCE(v_track->'artists', '[]'::jsonb))->>'id'),
        v_track->'album'->>'name',
        (v_track->>'popularity')::INT,
        (v_track->>'duration_ms')::INT,
        'top_track',
        'streaming_profile',
        NEW.id::TEXT,
        v_track,
        NEW.last_updated
      );
    END LOOP;
  END IF;
  
  -- Extract Apple Music data (similar pattern)
  IF NEW.service_type = 'apple-music' AND NEW.profile_data ? 'topArtists' THEN
    FOR v_artist IN SELECT jsonb_array_elements(NEW.profile_data->'topArtists') LOOP
      v_artist_name := v_artist->>'name';
      
      IF v_artist_name IS NOT NULL THEN
        INSERT INTO user_artist_interactions (
          user_id,
          artist_name,
          apple_music_artist_id,
          interaction_type,
          interaction_strength,
          genres,
          source_entity_type,
          source_entity_id,
          metadata,
          occurred_at
        ) VALUES (
          NEW.user_id,
          v_artist_name,
          v_artist->>'id',
          'streaming_top',
          8,
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_artist->'genres', '[]'::jsonb))),
          'streaming_profile',
          NEW.id::TEXT,
          v_artist,
          NEW.last_updated
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_capture_streaming_music ON streaming_profiles;
CREATE TRIGGER trigger_capture_streaming_music
AFTER INSERT OR UPDATE ON streaming_profiles
FOR EACH ROW
EXECUTE FUNCTION capture_streaming_music_data();

-- Add comment
COMMENT ON FUNCTION capture_streaming_music_data() IS 'Captures music metadata from streaming services, mapped to user UUID';

