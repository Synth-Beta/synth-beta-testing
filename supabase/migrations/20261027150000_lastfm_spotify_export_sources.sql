-- Last.fm + Spotify data-export imports (2026-10-27).
--
-- Spotify Development Mode only serves allowlisted accounts, so everyone else gets two
-- new sources, written by api/spotify/sync-profile.ts?source=...:
--   'lastfm'          top artists/tracks read by username (1month/6month/overall)
--   'spotify-export'  summary of the user's Spotify privacy-data export, parsed on device
-- Both use the same profile_data shape as a Spotify sync (topArtistsByTimeRange), so the
-- only DB changes are:
--   1. let streaming_profiles.service_type hold the two new values
--   2. let process_spotify_artists_to_signals() turn them into artist signals
--      (body = supabase/apple-music-audit-2026-09-11/02_apple_music_artist_signals.REVIEW.sql,
--      applied 2026-09-11; only the service_type list changes). The per-service DELETE
--      already keeps each source's signals separate.
--
-- Safe to re-run. If step 1 fails, some row holds a service_type not listed below:
--   SELECT service_type, count(*) FROM public.streaming_profiles GROUP BY 1;
-- add that value to the list and run again (the whole file rolls back on failure).

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.streaming_profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%service_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.streaming_profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.streaming_profiles
  ADD CONSTRAINT streaming_profiles_service_type_check
  CHECK (service_type IN ('spotify', 'apple-music', 'lastfm', 'spotify-export'));

CREATE OR REPLACE FUNCTION public.process_spotify_artists_to_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_occurred_at TIMESTAMPTZ;
BEGIN
  -- Every source that writes topArtists(ByTimeRange) in the Spotify shape.
  IF NEW.service_type NOT IN ('spotify', 'apple-music', 'lastfm', 'spotify-export') THEN
    RETURN NEW;
  END IF;
  IF NEW.profile_data IS NULL OR jsonb_typeof(NEW.profile_data) != 'object' THEN
    RETURN NEW;
  END IF;

  -- Idempotent refresh: each sync replaces the user's streaming artist signals
  -- (also cleans up the legacy NULL-entity_id rows on their next sync).
  DELETE FROM public.user_preference_signals
  WHERE user_id = NEW.user_id
    AND signal_type IN ('streaming_top_artist_short', 'streaming_top_artist_medium', 'streaming_top_artist_long')
    -- legacy rows without a source are Spotify's
    AND COALESCE(context->>'source', 'spotify') = NEW.service_type;

  v_occurred_at := COALESCE(NEW.last_updated::TIMESTAMPTZ, NOW());

  INSERT INTO public.user_preference_signals (
    user_id, signal_type, entity_type, entity_id, entity_name,
    signal_weight, genre, context, occurred_at, created_at, updated_at
  )
  SELECT
    NEW.user_id,
    r.sig_type::public.preference_signal_type,
    'artist'::public.preference_entity_type,
    matched.artist_uuid,
    art.value->>'name',
    -- base weight by recency bucket, decaying 2%/rank position, floored at 50%
    ROUND((r.base_weight * GREATEST(1.0 - 0.02 * (art.ord - 1), 0.5))::NUMERIC, 2),
    NULL,
    jsonb_build_object(
      'source', NEW.service_type,
      'time_range', r.range_key,
      'rank', art.ord,
      'spotify_artist_id', art.value->>'id'
    ),
    -- unique-ish occurred_at per row, same pattern as the genre trigger
    v_occurred_at + (ROW_NUMBER() OVER () * interval '1 millisecond'),
    NOW(),
    NOW()
  FROM (VALUES
    ('short_term',  'streaming_top_artist_short',  10.0::NUMERIC),
    ('medium_term', 'streaming_top_artist_medium',  6.0::NUMERIC),
    ('long_term',   'streaming_top_artist_long',    3.0::NUMERIC)
  ) AS r(range_key, sig_type, base_weight)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN NEW.profile_data->'topArtistsByTimeRange' ? r.range_key
       AND jsonb_typeof(NEW.profile_data->'topArtistsByTimeRange'->r.range_key) = 'array'
      THEN NEW.profile_data->'topArtistsByTimeRange'->r.range_key
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS art(value, ord)
  LEFT JOIN LATERAL (
    SELECT a.id AS artist_uuid
    FROM public.artists a
    WHERE lower(a.name) = lower(art.value->>'name')
    ORDER BY a.created_at NULLS LAST
    LIMIT 1
  ) matched ON true
  WHERE NULLIF(trim(art.value->>'name'), '') IS NOT NULL;

  -- Fallback: profiles without topArtistsByTimeRange (old Spotify syncs, and every
  -- Apple Music sync) only have a flat topArtists list -- treat it as medium_term.
  IF NOT (NEW.profile_data ? 'topArtistsByTimeRange'
          AND jsonb_typeof(NEW.profile_data->'topArtistsByTimeRange') = 'object')
     AND NEW.profile_data ? 'topArtists'
     AND jsonb_typeof(NEW.profile_data->'topArtists') = 'array' THEN
    INSERT INTO public.user_preference_signals (
      user_id, signal_type, entity_type, entity_id, entity_name,
      signal_weight, genre, context, occurred_at, created_at, updated_at
    )
    SELECT
      NEW.user_id,
      'streaming_top_artist_medium'::public.preference_signal_type,
      'artist'::public.preference_entity_type,
      matched.artist_uuid,
      art.value->>'name',
      ROUND((6.0 * GREATEST(1.0 - 0.02 * (art.ord - 1), 0.5))::NUMERIC, 2),
      NULL,
      jsonb_build_object('source', NEW.service_type, 'time_range', 'flat_top_artists', 'rank', art.ord, 'spotify_artist_id', art.value->>'id'),
      v_occurred_at + (art.ord * interval '1 millisecond'),
      NOW(),
      NOW()
    FROM jsonb_array_elements(NEW.profile_data->'topArtists') WITH ORDINALITY AS art(value, ord)
    LEFT JOIN LATERAL (
      SELECT a.id AS artist_uuid
      FROM public.artists a
      WHERE lower(a.name) = lower(art.value->>'name')
      ORDER BY a.created_at NULLS LAST
      LIMIT 1
    ) matched ON true
    WHERE NULLIF(trim(art.value->>'name'), '') IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- Verify after the first import (replace the user id):
-- SELECT signal_type, context->>'source' AS source, count(*), count(entity_id) AS linked
-- FROM public.user_preference_signals
-- WHERE user_id = '<user id>'
-- GROUP BY 1, 2;
