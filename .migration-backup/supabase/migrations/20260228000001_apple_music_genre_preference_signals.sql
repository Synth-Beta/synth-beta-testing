-- ============================================================
-- Apple Music genre preference signals
-- Extracts genres from streaming_profiles.profile_data.topArtists,
-- normalizes via resolve_genre_to_canonical, weights by frequency,
-- inserts into user_preference_signals.
-- ============================================================
-- Requires: streaming_profiles, preference_signal_type enum,
-- user_preference_signals, resolve_genre_to_canonical, genres
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Add apple_music_genre to preference_signal_type enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'preference_signal_type' AND e.enumlabel = 'apple_music_genre'
  ) THEN
    ALTER TYPE public.preference_signal_type ADD VALUE 'apple_music_genre';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. process_apple_music_genres_to_signals: extract genres and insert signals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_apple_music_genres_to_signals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist JSONB;
  v_genre TEXT;
  v_canonical TEXT;
  v_genre_agg RECORD;
  v_occurred_at TIMESTAMPTZ;
  v_idx INT := 0;
  -- Accumulate (canonical_genre → count) across all topArtists
  genre_counts JSONB := '{}'::JSONB;
  v_count INT;
  v_weight NUMERIC;
  v_base_weight NUMERIC := 1.0;
BEGIN
  IF NEW.service_type != 'apple-music' THEN
    RETURN NEW;
  END IF;

  -- Delete existing apple_music_genre signals for this user (idempotent refresh)
  DELETE FROM public.user_preference_signals
  WHERE user_id = NEW.user_id AND signal_type = 'apple_music_genre';

  -- Primary: aggregate genres from topArtists[].genres (normalized by backend)
  -- Backend transforms Apple Music { attributes: { genreNames } } → { genres: [...] }
  IF NEW.profile_data ? 'topArtists' AND jsonb_typeof(NEW.profile_data->'topArtists') = 'array' THEN
    FOR v_artist IN SELECT jsonb_array_elements(NEW.profile_data->'topArtists') LOOP
      IF v_artist ? 'genres' AND jsonb_typeof(v_artist->'genres') = 'array' THEN
        FOR v_genre IN SELECT jsonb_array_elements_text(v_artist->'genres') LOOP
          v_canonical := COALESCE(NULLIF(trim(public.resolve_genre_to_canonical(v_genre)), ''), trim(v_genre));
          IF v_canonical IS NOT NULL AND v_canonical != '' THEN
            v_count := COALESCE((genre_counts->>v_canonical)::INT, 0) + 1;
            genre_counts := genre_counts || jsonb_build_object(v_canonical, v_count);
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Fallback: use top-level topGenres string array when topArtists has no genre data
  -- topGenres is already sorted by frequency; treat each entry as count=1
  IF genre_counts = '{}'::JSONB AND NEW.profile_data ? 'topGenres' AND jsonb_typeof(NEW.profile_data->'topGenres') = 'array' THEN
    FOR v_genre IN SELECT jsonb_array_elements_text(NEW.profile_data->'topGenres') LOOP
      v_canonical := COALESCE(NULLIF(trim(public.resolve_genre_to_canonical(v_genre)), ''), trim(v_genre));
      IF v_canonical IS NOT NULL AND v_canonical != '' THEN
        v_count := COALESCE((genre_counts->>v_canonical)::INT, 0) + 1;
        genre_counts := genre_counts || jsonb_build_object(v_canonical, v_count);
      END IF;
    END LOOP;
  END IF;

  -- Nothing to insert if no genres found
  IF genre_counts = '{}'::JSONB THEN
    RETURN NEW;
  END IF;

  -- Insert signals for each aggregated genre
  -- weight = base * ln(frequency + 1)  (no time-range multiplier: Apple Music has no short/medium/long term)
  v_occurred_at := COALESCE(NEW.last_updated::TIMESTAMPTZ, NOW());
  FOR v_genre_agg IN
    SELECT key AS canonical_genre,
           (genre_counts->>key)::INT AS cnt
    FROM jsonb_object_keys(genre_counts) AS key
  LOOP
    v_weight := ROUND((v_base_weight * LN(v_genre_agg.cnt + 1))::NUMERIC, 2);
    v_weight := LEAST(v_weight, 99.99);
    -- Stagger occurred_at by 1ms per genre to satisfy the unique constraint
    v_occurred_at := v_occurred_at + (v_idx * interval '1 millisecond');
    v_idx := v_idx + 1;

    INSERT INTO public.user_preference_signals (
      user_id, signal_type, entity_type, entity_id, entity_name,
      signal_weight, genre, context, occurred_at, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      'apple_music_genre'::public.preference_signal_type,
      'genre'::public.preference_entity_type,
      NULL,
      v_genre_agg.canonical_genre,
      v_weight,
      v_genre_agg.canonical_genre,
      jsonb_build_object('source', 'apple-music', 'raw_genre', v_genre_agg.canonical_genre),
      v_occurred_at,
      NOW(),
      NOW()
    );
  END LOOP;

  -- Refresh user preferences so feed V5 picks up new genre scores immediately
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_user_preferences_v5') THEN
    PERFORM public.refresh_user_preferences_v5(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_apple_music_genres_to_signals IS
  'Extracts genres from Apple Music streaming_profiles, normalizes to canonical, weights by frequency, inserts into user_preference_signals so feed V5 personalizes for Apple Music users.';

-- ---------------------------------------------------------------------------
-- 3. Attach trigger to streaming_profiles (only if table exists)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'streaming_profiles'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_process_apple_music_genres_to_signals ON public.streaming_profiles;
    CREATE TRIGGER trigger_process_apple_music_genres_to_signals
      AFTER INSERT OR UPDATE ON public.streaming_profiles
      FOR EACH ROW
      WHEN (NEW.service_type = 'apple-music')
      EXECUTE FUNCTION public.process_apple_music_genres_to_signals();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Backfill: re-fire the trigger on all existing Apple Music profiles
--    so users who already synced get genre signals retroactively.
--    We touch sync_status (no-op value change) to produce an UPDATE row event.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'streaming_profiles'
  ) THEN
    UPDATE public.streaming_profiles
    SET sync_status = sync_status
    WHERE service_type = 'apple-music';
  END IF;
END $$;
