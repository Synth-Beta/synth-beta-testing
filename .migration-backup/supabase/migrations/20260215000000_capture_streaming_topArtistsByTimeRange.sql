-- ============================================================
-- Extend capture_streaming_music_data to use topArtistsByTimeRange
-- when present (Spotify saves short/medium/long term separately).
-- Preserves time-range context in metadata for downstream signals.
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
  v_time_range TEXT;
  v_artist_meta JSONB;
BEGIN
  -- Extract Spotify top artists: prefer topArtistsByTimeRange when present
  IF NEW.service_type = 'spotify' THEN
    -- Use topArtistsByTimeRange when available (preserves time-range context)
    IF NEW.profile_data ? 'topArtistsByTimeRange' AND jsonb_typeof(NEW.profile_data->'topArtistsByTimeRange') = 'object' THEN
      FOR v_time_range IN SELECT unnest(ARRAY['long_term', 'medium_term', 'short_term']) LOOP
        IF NEW.profile_data->'topArtistsByTimeRange' ? v_time_range
           AND jsonb_typeof(NEW.profile_data->'topArtistsByTimeRange'->v_time_range) = 'array' THEN
          FOR v_artist IN SELECT jsonb_array_elements(NEW.profile_data->'topArtistsByTimeRange'->v_time_range) LOOP
            v_artist_name := v_artist->>'name';
            v_artist_id := v_artist->>'id';
            v_artist_meta := COALESCE(v_artist, '{}'::jsonb) || jsonb_build_object('time_range', v_time_range);
            IF v_artist_name IS NOT NULL THEN
              INSERT INTO user_artist_interactions (
                user_id, artist_name, spotify_artist_id, interaction_type, interaction_strength,
                genres, popularity_score, source_entity_type, source_entity_id, metadata, occurred_at
              ) VALUES (
                NEW.user_id, v_artist_name, v_artist_id, 'streaming_top', 8,
                ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_artist->'genres', '[]'::jsonb))),
                (v_artist->>'popularity')::INT, 'streaming_profile', NEW.id::TEXT, v_artist_meta, NEW.last_updated
              );
              IF v_artist ? 'genres' THEN
                FOR v_genre IN SELECT jsonb_array_elements_text(v_artist->'genres') LOOP
                  INSERT INTO user_genre_interactions (
                    user_id, genre, interaction_type, interaction_count, artist_names,
                    source_entity_type, source_entity_id, occurred_at
                  ) VALUES (
                    NEW.user_id, v_genre, 'streaming_top', 1, ARRAY[v_artist_name],
                    'streaming_profile', NEW.id::TEXT, NEW.last_updated
                  );
                END LOOP;
              END IF;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    ELSIF NEW.profile_data ? 'topArtists' THEN
      -- Fallback to flat topArtists
      FOR v_artist IN SELECT jsonb_array_elements(NEW.profile_data->'topArtists') LOOP
        v_artist_name := v_artist->>'name';
        v_artist_id := v_artist->>'id';
        IF v_artist_name IS NOT NULL THEN
          INSERT INTO user_artist_interactions (
            user_id, artist_name, spotify_artist_id, interaction_type, interaction_strength,
            genres, popularity_score, source_entity_type, source_entity_id, metadata, occurred_at
          ) VALUES (
            NEW.user_id, v_artist_name, v_artist_id, 'streaming_top', 8,
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_artist->'genres', '[]'::jsonb))),
            (v_artist->>'popularity')::INT, 'streaming_profile', NEW.id::TEXT, v_artist, NEW.last_updated
          );
          IF v_artist ? 'genres' THEN
            FOR v_genre IN SELECT jsonb_array_elements_text(v_artist->'genres') LOOP
              INSERT INTO user_genre_interactions (
                user_id, genre, interaction_type, interaction_count, artist_names,
                source_entity_type, source_entity_id, occurred_at
              ) VALUES (
                NEW.user_id, v_genre, 'streaming_top', 1, ARRAY[v_artist_name],
                'streaming_profile', NEW.id::TEXT, NEW.last_updated
              );
            END LOOP;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Extract Spotify top tracks
  IF NEW.service_type = 'spotify' AND NEW.profile_data ? 'topTracks' THEN
    FOR v_track IN SELECT jsonb_array_elements(NEW.profile_data->'topTracks') LOOP
      INSERT INTO user_song_interactions (
        user_id, song_id, song_name, artist_names, artist_ids, album_name,
        popularity_score, duration_ms, interaction_type, source_entity_type, source_entity_id,
        metadata, occurred_at
      ) VALUES (
        NEW.user_id, v_track->>'id', v_track->>'name',
        ARRAY(SELECT jsonb_array_elements(COALESCE(v_track->'artists', '[]'::jsonb))->>'name'),
        ARRAY(SELECT jsonb_array_elements(COALESCE(v_track->'artists', '[]'::jsonb))->>'id'),
        v_track->'album'->>'name', (v_track->>'popularity')::INT, (v_track->>'duration_ms')::INT,
        'top_track', 'streaming_profile', NEW.id::TEXT, v_track, NEW.last_updated
      );
    END LOOP;
  END IF;

  -- Extract Apple Music data (supports both top-level name and attributes.name)
  IF NEW.service_type = 'apple-music' AND NEW.profile_data ? 'topArtists' THEN
    FOR v_artist IN SELECT jsonb_array_elements(NEW.profile_data->'topArtists') LOOP
      v_artist_name := COALESCE(v_artist->>'name', v_artist->'attributes'->>'name');
      IF v_artist_name IS NOT NULL THEN
        INSERT INTO user_artist_interactions (
          user_id, artist_name, apple_music_artist_id, interaction_type, interaction_strength,
          genres, source_entity_type, source_entity_id, metadata, occurred_at
        ) VALUES (
          NEW.user_id, v_artist_name, COALESCE(v_artist->>'id', ''),
          'streaming_top', 8,
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_artist->'genres', v_artist->'attributes'->'genreNames', '[]'::jsonb))),
          'streaming_profile', NEW.id::TEXT, v_artist, NEW.last_updated
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION capture_streaming_music_data() IS 'Captures music metadata from streaming_profiles. Uses topArtistsByTimeRange when present for Spotify to preserve time-range context.';
