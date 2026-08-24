-- READ-ONLY. Nothing here writes. Three independent questions, three results.
--
-- CONTEXT
-- -------
-- 20260823010000 established that exact-artist matching is structurally
-- capped: median user has 8 scored artists, 0-2 of which play locally inside
-- the 90-day feed window. So the 16.0 artist coefficient has almost nothing to
-- fire on, and recommended relevance rests almost entirely on genre.
--
-- Genre, as scored today, is a flat SUM over every tag on the event:
--     SUM(user_score[g]) for g in events.genres
-- Every tag counts equally regardless of how many events carry it. Two
-- consequences, both of which read to a user as "unrelated":
--   1. A broad tag (rock, pop) that matches thousands of events contributes
--      the same as a precise one (shoegaze, go-go) that matches a handful.
--   2. An event tagged with 8 broad genres outscores an event tagged with 1
--      exact genre, purely by having more terms in the sum.
--
-- The proposed fix is IDF weighting -- scale each genre's contribution by
-- LN(total_events / events_carrying_that_genre), so rare tags dominate common
-- ones. This measures whether that is worth doing before doing it.

-- ── Q1: How coarse are the genre tags actually in use? ─────────────────────
-- If the top tags cover most of the catalog, IDF has a lot to correct. If tag
-- frequency is already flat, IDF will not change much and is not worth it.
WITH upcoming AS (
  SELECT e.id, e.genres
  FROM public.events e
  WHERE e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
),
total AS (SELECT COUNT(*)::NUMERIC AS n FROM upcoming),
genre_freq AS (
  SELECT g.genre, COUNT(*)::NUMERIC AS event_count
  FROM upcoming u
  CROSS JOIN LATERAL unnest(COALESCE(u.genres, ARRAY[]::TEXT[])) AS g(genre)
  GROUP BY g.genre
)
SELECT
  'Q1_genre_frequency' AS report,
  gf.genre,
  gf.event_count::INT,
  ROUND(100.0 * gf.event_count / (SELECT n FROM total), 1) AS pct_of_upcoming_events,
  ROUND(LN((SELECT n FROM total) / gf.event_count), 2)     AS proposed_idf_weight
FROM genre_freq gf
ORDER BY gf.event_count DESC
LIMIT 30;

-- ── Q2: How many tags does a typical event carry? ─────────────────────────
-- Quantifies consequence 2 above. If most events carry 1-2 tags the multi-tag
-- inflation problem is theoretical; if the distribution has a long tail of
-- 6-10 tag events, those events are currently winning on volume alone.
SELECT
  'Q2_tags_per_event' AS report,
  COALESCE(array_length(e.genres, 1), 0) AS tag_count,
  COUNT(*)::INT                          AS events
FROM public.events e
WHERE e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
GROUP BY COALESCE(array_length(e.genres, 1), 0)
ORDER BY tag_count;

-- ── Q3: Is the artist-similarity path unblocked yet? ──────────────────────
-- Artist-to-artist similarity needs artists.genres populated. Prior work found
-- three distinct empty states (NULL, '{}', and the literal 'small artist'
-- placeholder) -- a backfill that does not exclude all three silently never
-- converges. This counts all three separately, restricted to artists that
-- actually have an upcoming event (the only ones the feed can surface anyway).
SELECT
  'Q3_artist_genre_coverage' AS report,
  COUNT(*)::INT AS artists_with_upcoming_events,
  COUNT(*) FILTER (WHERE a.genres IS NULL)::INT                     AS genres_null,
  COUNT(*) FILTER (WHERE a.genres = '{}'::TEXT[])::INT              AS genres_empty_array,
  COUNT(*) FILTER (WHERE 'small artist' = ANY(a.genres))::INT       AS genres_placeholder,
  COUNT(*) FILTER (
    WHERE a.genres IS NOT NULL
      AND a.genres <> '{}'::TEXT[]
      AND NOT ('small artist' = ANY(a.genres))
  )::INT AS genres_usable
FROM public.artists a
WHERE EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.artist_id = a.id
    AND e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
);

-- HOW TO READ IT
-- --------------
-- Q1: if the top few genres each cover >10% of upcoming events, IDF is worth
--     shipping -- those tags are currently carrying as much weight as precise
--     ones. proposed_idf_weight is the multiplier each genre would get; check
--     the spread between the broadest and the narrowest tag. A spread under
--     ~2x means IDF barely moves anything and should be skipped.
--
-- Q2: a meaningful population of events at 5+ tags confirms the multi-tag
--     inflation problem is real and not theoretical.
--
-- Q3: genres_usable is the true size of the artist-similarity corpus. If it is
--     a small fraction of artists_with_upcoming_events, similarity stays
--     blocked on the enrichment backlog and IDF is correctly the next step. If
--     it is most of them, the backlog matters less than assumed and similarity
--     could be built sooner than expected -- worth knowing either way.
