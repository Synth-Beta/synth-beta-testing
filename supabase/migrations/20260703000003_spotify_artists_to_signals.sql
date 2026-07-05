-- Spotify top artists -> artist preference signals (Spotify-live-events-style recommendations, part 1 of 2)
--
-- Problem: syncing Spotify stores topArtistsByTimeRange in streaming_profiles,
-- but only GENRES are extracted into user_preference_signals (via
-- process_spotify_genres_to_signals). No artist-level signals are created, so
-- refresh_user_preferences_v5 computes artist_preference_scores purely from
-- manual picks/follows -- your actual listening never reaches the feed.
-- (573 legacy streaming_top_artist_long signals exist from a dead code path,
-- all with entity_id = NULL, so they're invisible to the aggregator anyway.)
--
-- This migration adds a trigger that, on every Spotify sync:
--   1. Replaces the user's streaming_top_artist_* signals (idempotent, mirrors
--      how process_spotify_genres_to_signals handles spotify_genre signals).
--   2. Emits one signal per artist per time range, weighted by recency:
--        short_term  (last ~4 weeks)  -> weight 10
--        medium_term (last ~6 months) -> weight  6
--        long_term   (all time)       -> weight  3
--      An artist you play heavily right now appears in all three ranges and
--      accumulates up to ~19 -- exactly the "most-listened recently" emphasis.
--      Within each range, weight decays 2% per rank position (floor 50%), so
--      your #1 artist counts roughly double your #30.
--   3. Resolves each artist name to an artists.id (case-insensitive match) so
--      refresh_user_preferences_v5 can aggregate it into
--      artist_preference_scores (it requires entity_id IS NOT NULL).
--      Unmatched names are still stored (entity_name only) for future matching.
--
-- refresh_user_preferences_v5 itself needs NO changes -- once entity_id is
-- populated it already sums these into artist_preference_scores / top_artists.
-- Part 2 (20260703000004) makes the feed actually read those scores.
--
-- Safe to run as one normal transaction (no CONCURRENTLY, no enum changes --
-- streaming_top_artist_short/medium/long already exist in preference_signal_type).

CREATE OR REPLACE FUNCTION public.process_spotify_artists_to_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_occurred_at TIMESTAMPTZ;
BEGIN
  IF NEW.service_type != 'spotify' THEN
    RETURN NEW;
  END IF;
  IF NEW.profile_data IS NULL OR jsonb_typeof(NEW.profile_data) != 'object' THEN
    RETURN NEW;
  END IF;

  -- Idempotent refresh: each sync replaces the user's streaming artist signals
  -- (also cleans up the legacy NULL-entity_id rows on their next sync).
  DELETE FROM public.user_preference_signals
  WHERE user_id = NEW.user_id
    AND signal_type IN ('streaming_top_artist_short', 'streaming_top_artist_medium', 'streaming_top_artist_long');

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
      'source', 'spotify',
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

  -- Fallback: profiles synced before topArtistsByTimeRange existed only have a
  -- flat topArtists list -- treat it as medium_term so they still get signals.
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
      jsonb_build_object('source', 'spotify', 'time_range', 'flat_top_artists', 'rank', art.ord, 'spotify_artist_id', art.value->>'id'),
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

DROP TRIGGER IF EXISTS trigger_process_spotify_artists_to_signals ON public.streaming_profiles;
CREATE TRIGGER trigger_process_spotify_artists_to_signals
  AFTER INSERT OR UPDATE OF profile_data ON public.streaming_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.process_spotify_artists_to_signals();

-- ============================================================================
-- Cleanup: neither user_preference_signals nor streaming_profiles has an FK to
-- users, so deleting an account leaves its rows behind (verified: 15 deleted
-- users left 123 orphaned signals, and 1 deleted user left a Spotify
-- streaming_profile). refresh_user_preferences_v5(NULL) then tries to INSERT
-- user_preferences rows for those ghost user_ids and fails on
-- user_preferences_new_user_id_fkey1 -- the error both prior runs of this file
-- hit. (Run 2 failed because the backfill UPDATE below re-fired the triggers
-- for the ghost profile, re-creating ghost signals right after they'd been
-- cleaned.) Both deletes below ONLY remove rows whose owning account no longer
-- exists in public.users.
-- ============================================================================
DELETE FROM public.streaming_profiles sp
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.user_id = sp.user_id
);

-- ============================================================================
-- Backfill: fire the trigger for every already-synced Spotify profile, then
-- recompute user_preferences so artist_preference_scores picks up the new
-- signals immediately (no need to wait for each user's next sync).
-- Note: this no-op UPDATE also re-fires the existing genre trigger -- that's
-- fine, it's idempotent (delete + reinsert of spotify_genre signals).
-- ============================================================================
UPDATE public.streaming_profiles
SET profile_data = profile_data
WHERE service_type = 'spotify'
  AND profile_data IS NOT NULL;

-- Orphaned-signal sweep AFTER the backfill so it catches both the 123 legacy
-- orphans and anything else attributed to deleted users.
DELETE FROM public.user_preference_signals s
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.user_id = s.user_id
);

SELECT public.refresh_user_preferences_v5(NULL);
