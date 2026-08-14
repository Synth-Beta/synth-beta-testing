-- =============================================================================
-- Backfill: events with no genre inherit their artist's genre   (EDITOR-SAFE, batched)
-- =============================================================================
-- scripts/sync-jambase-incremental-3nf.mjs writes an event's genres straight from
-- JamBase's per-event performer payload, which is often empty even when our own
-- artists table already has real genre data for that same artist (from a separate
-- enrichment path). This mirrors the fallback the sync now applies going forward
-- (eventGenresFromArtistIfEmpty, wired into upsertEvents3NF) but as a retroactive
-- one-time pass over existing rows.
--
-- Additive only: never touches an event that already has genres. A donor artist
-- only counts as having a real genre if it's neither NULL, nor '{}' (empty array —
-- some artists have this instead of NULL, e.g. from a NOT NULL DEFAULT '{}'), nor
-- the ['small artist'] placeholder default. Missing any one of those three states
-- makes an artist a permanent no-op donor: the backfill "sets" the event's genres
-- to the same non-informative value every run, which still matches the eligibility
-- WHERE clause, so it never converges to 0. (Caught live: the empty-array case was
-- missed on the first version of this migration and got 141 artists / ~1,017
-- events stuck exactly like that — this version excludes all three.)
--
-- BATCHED — a single unbounded UPDATE across all ~269K events timed out. Run STEP 2
-- over and over (highlight it, run it). It's self-terminating: once a row's genres
-- get set to a REAL genre it no longer matches the WHERE clause, so re-running
-- always makes forward progress. Keep running until it reports "UPDATE 0".
-- =============================================================================
SET statement_timeout = '300s';

-- ===== STEP 0 (only if a previous run got "Failed to fetch" / a stuck session) ==
SELECT pid, pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename = 'postgres' AND state = 'active'
  AND query LIKE '-- ====%' AND pid <> pg_backend_pid();

-- ===== STEP 1 — pre-check: how many events are still eligible ==================
SELECT count(*) AS events_still_eligible
FROM public.events e
JOIN public.artists a ON a.id = e.artist_id
WHERE (e.genres IS NULL OR e.genres = '{}')
  AND a.genres IS NOT NULL
  AND a.genres <> '{}'::text[]
  AND a.genres <> ARRAY['small artist']::text[];

-- ===== STEP 2 — BATCHED backfill ================================================
-- Run this SAME statement over and over. Each run updates up to 5,000 events that
-- still qualify. ⟳ repeat until it says UPDATE 0.
UPDATE public.events e
SET genres = a.genres,
    updated_at = now()
FROM public.artists a
WHERE e.id IN (
  SELECT e2.id
  FROM public.events e2
  JOIN public.artists a2 ON a2.id = e2.artist_id
  WHERE (e2.genres IS NULL OR e2.genres = '{}')
    AND a2.genres IS NOT NULL
    AND a2.genres <> '{}'::text[]
    AND a2.genres <> ARRAY['small artist']::text[]
  LIMIT 5000
)
AND e.artist_id = a.id;

-- ===== STEP 3 — verify ==========================================================
SELECT count(*) AS events_still_eligible_expect_0
FROM public.events e
JOIN public.artists a ON a.id = e.artist_id
WHERE (e.genres IS NULL OR e.genres = '{}')
  AND a.genres IS NOT NULL
  AND a.genres <> '{}'::text[]
  AND a.genres <> ARRAY['small artist']::text[];
