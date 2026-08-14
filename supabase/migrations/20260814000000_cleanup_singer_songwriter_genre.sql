-- Cleanup: "singer-songwriter" is a real tag MusicBrainz/iTunes return, but too
-- generic (a performance format, not a sound) to be useful — excluded from
-- GENRE_CHAT_TAG_MAP (packages/synth-shared/src/genreChatTagMap.ts, 2026-08-14)
-- and from what scripts/fetch-artist-genres.mjs will save going forward
-- (stripGenericGenres). This retroactively cleans up what was already saved
-- before that fix, small enough (252 artists) to run as plain statements.
--
-- Two cases, handled differently:
-- 1. Artists where it's the ONLY genre on file (19 rows): reset to NULL so
--    they re-enter the enrichment backlog instead of staying permanently
--    "resolved" on the weakest possible answer — a future run (MusicBrainz
--    retry, iTunes, or a paid JamBase lookup) might find something real.
-- 2. Artists where it co-occurs with a real genre (233 rows): just remove
--    the generic tag, keep the useful one(s) — no need to re-queue these,
--    they already have better data.
--
-- events.genres gets the same two-case treatment, since that's what
-- genre-chat matching actually reads (events inherit genres from their
-- artist via the 20260812120000 backfill migration).

UPDATE public.artists
SET genres = NULL,
    genre_lookup_attempted_at = NULL,
    updated_at = now()
WHERE genres = ARRAY['singer-songwriter']::text[]
   OR genres = ARRAY['singer songwriter']::text[];

UPDATE public.artists
SET genres = array_remove(array_remove(genres, 'singer-songwriter'), 'singer songwriter'),
    updated_at = now()
WHERE genres @> ARRAY['singer-songwriter']::text[]
   OR genres @> ARRAY['singer songwriter']::text[];

UPDATE public.events
SET genres = NULL,
    updated_at = now()
WHERE genres = ARRAY['singer-songwriter']::text[]
   OR genres = ARRAY['singer songwriter']::text[];

UPDATE public.events
SET genres = array_remove(array_remove(genres, 'singer-songwriter'), 'singer songwriter'),
    updated_at = now()
WHERE genres @> ARRAY['singer-songwriter']::text[]
   OR genres @> ARRAY['singer songwriter']::text[];

-- Verify: expect 0 for both.
SELECT
  (SELECT count(*) FROM public.artists WHERE genres @> ARRAY['singer-songwriter']::text[]) AS artists_left,
  (SELECT count(*) FROM public.events WHERE genres @> ARRAY['singer-songwriter']::text[]) AS events_left;
