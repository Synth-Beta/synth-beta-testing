-- Apple Music -> artist preference signals (2026-09-11). APPLIED 2026-09-11.
--
-- Problem: process_spotify_artists_to_signals() starts with
--   IF NEW.service_type != 'spotify' THEN RETURN NEW;
-- so an Apple Music sync produces genre signals at best and ZERO artist signals. The
-- Recommended feed ranks mostly on artist_preference_scores, so Apple Music users would
-- get almost no personalization from connecting.
--
-- Change (3 spots, marked "CHANGED"), everything else is the body from migration
-- 20260703000003_spotify_artists_to_signals.sql:
--   1. accept 'apple-music' as well as 'spotify'
--   2. the idempotent DELETE only clears signals from the SAME service, so a user with
--      both connected doesn't have one sync wipe the other's artists
--   3. context.source records the real service
-- Apple payloads have no topArtistsByTimeRange, so they take the existing flat-topArtists
-- fallback branch (streaming_top_artist_medium).
--
-- VERIFIED 2026-09-11 (01_diagnose_readonly.sql Q2): the live function body is identical
-- to migration 20260703000003, so the only differences below are the 3 CHANGED spots.
-- Re-run Q2 first if a lot of time has passed since then.
--
-- No backfill needed: there are no apple-music rows yet.

CREATE OR REPLACE FUNCTION public.process_spotify_artists_to_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_occurred_at TIMESTAMPTZ;
BEGIN
  -- CHANGED (1)
  IF NEW.service_type NOT IN ('spotify', 'apple-music') THEN
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
    -- CHANGED (2): legacy rows without a source are Spotify's
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
      'source', NEW.service_type, -- CHANGED (3)
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
      -- CHANGED (3)
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

-- Verify after the first real Apple Music sync (replace the user id):
-- SELECT signal_type, context->>'source' AS source, count(*), count(entity_id) AS linked
-- FROM public.user_preference_signals
-- WHERE user_id = '<apple user id>'
-- GROUP BY 1, 2;
