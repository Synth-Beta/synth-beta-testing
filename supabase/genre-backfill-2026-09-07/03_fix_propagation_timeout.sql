-- =============================================================================
-- Fix: propagate_artist_genres_to_events() times out on an EMPTY backlog
-- =============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
--
-- SYMPTOM (found live 2026-09-07, immediately after 02 was applied):
--   SELECT public.propagate_artist_genres_to_events(1, 1);
--   ERROR: canceling statement due to statement timeout
-- ...on a request to update at most ONE row.
--
-- CAUSE: nothing indexes "events with no genres". The inner
--   SELECT e2.id ... WHERE (e2.genres IS NULL OR e2.genres = '{}') ... LIMIT 1
-- can satisfy LIMIT 1 instantly while rows still match, but once the backlog is
-- clear it must scan all ~287K events joined to artists to prove no row matches.
-- That is the steady state this job runs in every night, so the scheduled job as
-- written in 02 would time out on essentially every run and propagate nothing --
-- failing silently, exactly like the manual-only migration it replaced.
--
-- 20260812120000 masked this with a session-level SET statement_timeout='300s'.
-- A pg_cron invocation gets no such session, so the function must carry its own.
--
-- TWO FIXES, both needed:
--   1. A partial index so the empty-backlog probe is a millisecond index scan
--      instead of a 300s sequential scan burned nightly.
--   2. A function-level statement_timeout as the belt, for the first run after
--      a large enrich sweep when there IS a real backlog to chew through.
--
-- ⚠️  NOT concurrently. The Supabase web editor wraps EVERY execution in a
--     transaction -- not just multi-statement pastes -- so CREATE INDEX
--     CONCURRENTLY always fails there with 25001, even run alone. Confirmed
--     live 2026-09-07. Plain CREATE INDEX is the right call here anyway: the
--     partial predicate matches only ~2,400 rows, so the build is seconds.
--
--     It does take a SHARE lock on `events` for that time: reads keep working,
--     writes block. The only writer is the JamBase sync -- don't run this while
--     a sync is in flight.
-- =============================================================================

-- ===== STEP 1 — run this statement first ====================================
CREATE INDEX IF NOT EXISTS idx_events_missing_genres
  ON public.events (artist_id)
  WHERE genres IS NULL OR genres = '{}'::text[];

-- ===== STEP 2 — everything below can go in one paste ========================
CREATE OR REPLACE FUNCTION public.propagate_artist_genres_to_events(
  p_batch_size  INTEGER DEFAULT 5000,
  p_max_batches INTEGER DEFAULT 20
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
-- CHANGED (this file): pg_cron gives the function no session settings, so the
-- 300s budget the manual migration relied on has to live on the function.
SET statement_timeout TO '300s'
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
        -- Predicate written to match idx_events_missing_genres exactly so the
        -- planner can use the partial index. Do not "tidy" this into
        -- coalesce(e2.genres,'{}') = '{}' -- that no longer implies the index
        -- predicate and the seq scan comes straight back.
        WHERE (e2.genres IS NULL OR e2.genres = '{}')
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

-- ===== STEP 3 — verify. This is the exact call that used to time out. =======
SELECT public.propagate_artist_genres_to_events() AS events_updated;

SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'artist-genre-propagation';
