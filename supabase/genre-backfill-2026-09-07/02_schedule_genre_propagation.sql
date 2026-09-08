-- =============================================================================
-- Make artist→event genre propagation automatic (2026-09-07)
-- =============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
--
-- WHY: supabase/migrations/20260812120000_backfill_event_genres_from_artist.sql
-- is a MANUAL one-shot. The sync only fills an event's genres at INSERT time
-- (eventGenresFromArtistIfEmpty in scripts/sync-jambase-incremental-3nf.mjs), so
-- whenever enrich-artist-genres.mjs resolves an artist AFTER its events already
-- exist, those events stay blank until a human re-runs the migration by hand.
-- Nobody did, and 9,702 events accumulated (5,093 of them upcoming) before it
-- was noticed on 2026-09-07. This closes the loop permanently.
--
-- Runs at 07:40 UTC, 30 min ahead of the existing 'genre-idf-refresh' job at
-- 08:10, so newly-propagated genres are in the materialized view the same day
-- rather than a day late. get_personalized_feed_v5 INNER JOINs genre_idf, so a
-- slug missing from it contributes nothing to scoring.
-- =============================================================================

-- ── Part A: the batched propagation function ────────────────────────────────
-- Bounded on both axes: p_batch_size rows per statement, p_max_batches
-- statements per invocation. A runaway job can never hold a long transaction
-- or blow the statement timeout, and anything left over is picked up tomorrow.
CREATE OR REPLACE FUNCTION public.propagate_artist_genres_to_events(
  p_batch_size  INTEGER DEFAULT 5000,
  p_max_batches INTEGER DEFAULT 20
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total   INTEGER := 0;
  v_updated INTEGER;
  i         INTEGER;
BEGIN
  FOR i IN 1..GREATEST(p_max_batches, 1) LOOP
    UPDATE public.events e
    -- array_remove: 19 artists carry a MIXED ['small artist', <real genre>]
    -- array; copying it whole would leak the placeholder onto the event.
    SET genres = array_remove(a.genres, 'small artist')
    FROM public.artists a
    WHERE a.id = e.artist_id
      AND e.id IN (
        SELECT e2.id
        FROM public.events e2
        JOIN public.artists a2 ON a2.id = e2.artist_id
        WHERE (e2.genres IS NULL OR e2.genres = '{}')
          -- All THREE empty states must be excluded. Miss any one and the job
          -- "succeeds" forever without converging: an artist with '{}' reads as
          -- a valid donor, and copying '{}' still leaves the event empty.
          AND a2.genres IS NOT NULL
          AND a2.genres <> '{}'::text[]
          AND a2.genres <> ARRAY['small artist']::text[]
        LIMIT p_batch_size
      );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_total := v_total + v_updated;
    EXIT WHEN v_updated = 0;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.propagate_artist_genres_to_events(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- ── Part B: schedule it ─────────────────────────────────────────────────────
SELECT cron.unschedule('artist-genre-propagation')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'artist-genre-propagation');

SELECT cron.schedule(
  'artist-genre-propagation',
  '40 7 * * *',
  $$SELECT public.propagate_artist_genres_to_events();$$
);

-- ── Part C: run it once now, and verify ─────────────────────────────────────
SELECT public.propagate_artist_genres_to_events() AS events_updated_now;

SELECT count(*) AS events_still_eligible_expect_0
FROM public.events e
JOIN public.artists a ON a.id = e.artist_id
WHERE (e.genres IS NULL OR e.genres = '{}')
  AND a.genres IS NOT NULL
  AND a.genres <> '{}'::text[]
  AND a.genres <> ARRAY['small artist']::text[];

SELECT jobname, schedule FROM cron.job WHERE jobname IN ('artist-genre-propagation','genre-idf-refresh');
