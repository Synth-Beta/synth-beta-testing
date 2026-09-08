-- =============================================================================
-- Re-run of the event-genre backfill (2026-09-07)
-- =============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
--
-- WHY AGAIN: supabase/migrations/20260812120000_backfill_event_genres_from_artist.sql
-- is a ONE-TIME job. Every artist enriched after 2026-08-12 (the whole Last.fm
-- sweep) left its already-existing events untouched. Measured live 2026-09-07:
-- 9,702 events (5,077 of them upcoming) have no genres while their artist does.
--
-- CHANGED vs the original: SET copies array_remove(a.genres, 'small artist')
-- instead of a.genres. 19 artists carry a MIXED ['small artist', <real genre>]
-- array; the original copied the placeholder straight onto the event.
--
-- Artists with no real genre are excluded on all THREE empty states (NULL,
-- '{}', exactly ['small artist']). Missing any one of them makes the job
-- self-perpetuating: it "succeeds" every run and never converges to 0.
--
-- RUN STEP 2 REPEATEDLY UNTIL IT SAYS "UPDATE 0". It is batched at 5,000 rows
-- and self-shrinking — once an event gets a real genre it stops matching.
-- =============================================================================

SET statement_timeout = '300s';

-- ===== STEP 1 — how many events are eligible right now =======================
SELECT count(*) AS events_still_eligible
FROM public.events e
JOIN public.artists a ON a.id = e.artist_id
WHERE (e.genres IS NULL OR e.genres = '{}')
  AND a.genres IS NOT NULL
  AND a.genres <> '{}'::text[]
  AND a.genres <> ARRAY['small artist']::text[];

-- ===== STEP 2 — batched backfill. Repeat until "UPDATE 0". ===================
UPDATE public.events e
SET genres = array_remove(a.genres, 'small artist')
FROM public.artists a
WHERE a.id = e.artist_id
  AND e.id IN (
    SELECT e2.id
    FROM public.events e2
    JOIN public.artists a2 ON a2.id = e2.artist_id
    WHERE (e2.genres IS NULL OR e2.genres = '{}')
      AND a2.genres IS NOT NULL
      AND a2.genres <> '{}'::text[]
      AND a2.genres <> ARRAY['small artist']::text[]
    LIMIT 5000
  );

-- ===== STEP 3 — verify (expect 0) ===========================================
SELECT count(*) AS events_still_eligible_expect_0
FROM public.events e
JOIN public.artists a ON a.id = e.artist_id
WHERE (e.genres IS NULL OR e.genres = '{}')
  AND a.genres IS NOT NULL
  AND a.genres <> '{}'::text[]
  AND a.genres <> ARRAY['small artist']::text[];
