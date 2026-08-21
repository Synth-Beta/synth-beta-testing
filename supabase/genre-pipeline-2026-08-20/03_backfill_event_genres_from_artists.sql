-- ============================================================================
-- 03 — Backfill genres onto events that have none, from their artist.
-- ============================================================================
--
-- 13.4% of upcoming events (5,352 of a verified 39,995-row sample) have no
-- genres at all. An event with no genres is invisible to every one of the 12
-- genre chats AND to genre personalisation in get_personalized_feed_v5 -- it
-- can only ever surface via artist-follow, venue, or popularity terms. This is
-- the single largest reachability gap in the genre system; the 6.2% with
-- unmapped tags is second.
--
-- The sync already does this for NEW events via eventGenresFromArtistIfEmpty()
-- in scripts/sync-jambase-incremental-3nf.mjs. This is the one-time catch-up
-- for the backlog that predates it.
--
-- WHAT COUNTS AS A USABLE SOURCE
--   * artist has a non-empty genres array, AND
--   * it is not the 'small artist' sentinel the sync writes when no genre
--     lookup succeeded (10,719 artists), AND
--   * it is not the placeholder set cleaned in 02_ (defensive; 02 should have
--     already nulled these).
-- Anything else is left alone. An honestly-empty event is better than one
-- tagged from a placeholder -- that is exactly how the EDM chat broke.
--
-- ORDERING: run after 02_. Enrichment is NOT a prerequisite -- measured live
-- 2026-08-20, this migration fixes 1,663 of the 5,692 untagged upcoming events
-- (29%) immediately from artists that already have good genres. The remaining
-- 4,016 are waiting on ~2,510 artists that need scripts/enrich-artist-genres.mjs.
--
-- This is IDEMPOTENT and safe to re-run: it only ever touches events whose
-- genres are NULL/empty, so running it now and again after each enrichment
-- session simply sweeps up whatever became fixable in between. Do not block
-- on a ~12h enrichment backlog before taking the 29%.
--
-- BATCHED ON PURPose: per this project's operational history, the Supabase web
-- editor wraps a multi-statement paste in a single transaction, and a heavy
-- unbatched UPDATE that dies on "Failed to fetch" leaves a stuck session
-- holding locks. Run the DO block below on its own, or call the function
-- repeatedly until it returns 0.

BEGIN;

CREATE OR REPLACE FUNCTION public.backfill_event_genres_from_artist(p_batch_size integer DEFAULT 2000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH candidates AS (
    SELECT e.id, a.genres AS artist_genres
    FROM public.events e
    JOIN public.artists a ON a.id = e.artist_id
    WHERE (e.genres IS NULL OR cardinality(e.genres) = 0)
      AND a.genres IS NOT NULL
      AND cardinality(a.genres) > 0
      -- exclude the 'small artist' sentinel
      AND NOT (a.genres @> ARRAY['small artist']::text[])
      -- exclude the placeholder set (defensive; 02_ should have cleared it)
      AND NOT (a.genres @> ARRAY['Blues','Classical','Country','Electronic','Folk']::text[])
    LIMIT p_batch_size
    FOR UPDATE OF e SKIP LOCKED
  )
  UPDATE public.events e
  SET genres     = c.artist_genres,
      updated_at = now()
  FROM candidates c
  WHERE e.id = c.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

COMMIT;

-- ── OPTIONAL: index to stop the candidate scan timing out ──────────────────
-- Measured 2026-08-20: with no index, batch_size 5000 and even 500 exceed the
-- 8s PostgREST statement timeout, while 200 completes in ~3.2s. The cost is the
-- scan for events with no genres -- once most of them are NOT fixable (their
-- artist is still 'small artist'), the planner has to walk a lot of rows to
-- fill a batch. This partial index makes that lookup cheap and lets you go back
-- to large batches.
--
-- Run it ONCE, on its own, ideally when the enrichment script is not running:
--
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_untagged_artist
--       ON public.events (artist_id)
--       WHERE genres IS NULL;
--
-- CONCURRENTLY cannot run inside a transaction block, so it must NOT be pasted
-- with anything else in the Supabase editor -- same constraint that broke the
-- original DO-block version of the runner below.

-- ── RUN ────────────────────────────────────────────────────────────────────
-- Run this ONE statement, repeatedly, until it returns 0. Each call is its own
-- transaction (statement-level autocommit), so nothing is held open between
-- batches and an interrupted run simply resumes where it left off.
--
--     SELECT public.backfill_event_genres_from_artist(5000);
--
-- Returns the number of events updated. Expect a few thousand on the first
-- calls, then a final 0 when the queue is drained. Re-run again after any
-- scripts/enrich-artist-genres.mjs session to sweep up newly-fixable events.
--
-- DO NOT wrap this in a DO $$ ... $$ block containing COMMIT. An earlier
-- revision of this file did exactly that and it fails in the Supabase SQL
-- editor -- the editor runs statements inside an implicit transaction, and
-- PL/pgSQL refuses transaction control there ("invalid transaction
-- termination"). Plain repeated SELECTs avoid the problem entirely.
--
-- Only if you are on psql (real autocommit, no wrapping transaction) can you
-- automate the loop:
--
--     \set QUIET on
--     SELECT public.backfill_event_genres_from_artist(5000) \gset
--     -- ...or just call it in a shell loop until it prints 0.

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- Before/after on upcoming events; expect the untagged share to drop well
-- below the measured 13.4%.
--
-- SELECT
--   count(*) FILTER (WHERE genres IS NULL OR cardinality(genres) = 0) AS untagged,
--   count(*)                                                          AS total,
--   round(100.0 * count(*) FILTER (WHERE genres IS NULL OR cardinality(genres) = 0) / count(*), 1) AS pct
-- FROM public.events
-- WHERE event_date >= now();
--
-- How many remain untagged only because their artist is also unusable?
-- SELECT count(*)
-- FROM public.events e
-- LEFT JOIN public.artists a ON a.id = e.artist_id
-- WHERE e.event_date >= now()
--   AND (e.genres IS NULL OR cardinality(e.genres) = 0)
--   AND (a.genres IS NULL OR cardinality(a.genres) = 0 OR a.genres @> ARRAY['small artist']::text[]);
