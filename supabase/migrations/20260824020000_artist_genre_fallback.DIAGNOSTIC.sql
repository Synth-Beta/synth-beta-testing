-- READ-ONLY. Nothing here writes.
--
-- Q3 of 20260824000000 found 8,997 upcoming events carry ZERO genre tags.
-- Those events can never score on genre, so they reach the feed only via the
-- popularity term or as unmatched backfill -- roughly 10% of the catalog is
-- invisible to personalisation.
--
-- Proposed fix, before building anything as heavy as an artist-similarity
-- model: when an event has no genres of its own, fall back to its ARTIST's
-- genres. artists.genres is populated for 16,062 of the 19,901 artists with
-- upcoming shows, so the data may already be sitting there.
--
-- This measures whether that is true, and whether the fallback is worth
-- extending to thinly-tagged events rather than only empty ones.

-- ── Q1: can the fallback actually rescue the untagged events? ────────────
WITH upcoming AS (
  SELECT e.id, e.genres, e.artist_id
  FROM public.events e
  WHERE e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
),
classified AS (
  SELECT
    u.id,
    COALESCE(array_length(u.genres, 1), 0) AS event_tags,
    CASE
      WHEN a.genres IS NULL THEN 0
      WHEN a.genres = '{}'::TEXT[] THEN 0
      WHEN 'small artist' = ANY(a.genres) THEN 0
      ELSE COALESCE(array_length(a.genres, 1), 0)
    END AS artist_tags
  FROM upcoming u
  LEFT JOIN public.artists a ON a.id = u.artist_id
)
SELECT
  'Q1_fallback_reach' AS report,
  COUNT(*) FILTER (WHERE event_tags = 0)                          AS events_with_no_tags,
  COUNT(*) FILTER (WHERE event_tags = 0 AND artist_tags > 0)      AS rescued_by_artist_genres,
  ROUND(100.0 * COUNT(*) FILTER (WHERE event_tags = 0 AND artist_tags > 0)
        / NULLIF(COUNT(*) FILTER (WHERE event_tags = 0), 0), 1)   AS pct_rescued,
  COUNT(*) FILTER (WHERE event_tags = 0 AND artist_tags = 0)      AS still_unscorable
FROM classified;

-- ── Q2: is the artist fingerprint richer than the event tags? ────────────
-- If artists carry meaningfully more genres than their events do, the
-- fallback is worth extending beyond empty events -- a 1-tag event whose
-- artist has 5 genres is currently being scored on a fraction of what is
-- known about it. If artist tags are no richer, restrict the change to
-- empty events only and do not touch the rest.
WITH upcoming AS (
  SELECT e.id, e.genres, e.artist_id
  FROM public.events e
  WHERE e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
),
paired AS (
  SELECT
    COALESCE(array_length(u.genres, 1), 0) AS event_tags,
    CASE
      WHEN a.genres IS NULL OR a.genres = '{}'::TEXT[]
        OR 'small artist' = ANY(a.genres) THEN 0
      ELSE COALESCE(array_length(a.genres, 1), 0)
    END AS artist_tags
  FROM upcoming u
  LEFT JOIN public.artists a ON a.id = u.artist_id
)
SELECT
  'Q2_richness' AS report,
  event_tags,
  COUNT(*)                                  AS events,
  ROUND(AVG(artist_tags), 2)                AS avg_artist_tags,
  COUNT(*) FILTER (WHERE artist_tags > event_tags) AS artist_richer
FROM paired
WHERE event_tags <= 3
GROUP BY event_tags
ORDER BY event_tags;

-- ── Q3: do artist genres slug-normalise cleanly? ─────────────────────────
-- events.genres turned out to carry both slug and non-slug forms, which is
-- what broke genre matching until 20260824000000. Do not assume artists.genres
-- is any tidier -- if its values do not resolve through genre_match_slug into
-- genre_idf, the fallback will silently score 0 and look like it did nothing.
WITH artist_tags AS (
  SELECT DISTINCT g.genre
  FROM public.artists a
  CROSS JOIN LATERAL unnest(COALESCE(a.genres, ARRAY[]::TEXT[])) AS g(genre)
  WHERE EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.artist_id = a.id
      AND e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
  )
)
SELECT
  'Q3_slug_resolution' AS report,
  COUNT(*)                                                        AS distinct_artist_tags,
  COUNT(*) FILTER (WHERE gi.genre_slug IS NOT NULL)               AS resolve_into_genre_idf,
  ROUND(100.0 * COUNT(*) FILTER (WHERE gi.genre_slug IS NOT NULL)
        / NULLIF(COUNT(*), 0), 1)                                 AS pct_resolving
FROM artist_tags at
LEFT JOIN public.genre_idf gi ON gi.genre_slug = public.genre_match_slug(at.genre);

-- ── Q4: what do the non-resolving artist tags look like? ────────────────
-- Names the actual offenders so the gap is fixable rather than mysterious.
WITH artist_tags AS (
  SELECT g.genre, COUNT(*) AS artists
  FROM public.artists a
  CROSS JOIN LATERAL unnest(COALESCE(a.genres, ARRAY[]::TEXT[])) AS g(genre)
  WHERE EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.artist_id = a.id
      AND e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
  )
  GROUP BY g.genre
)
SELECT 'Q4_unresolved_tags' AS report, at.genre, at.artists::INT,
       public.genre_match_slug(at.genre) AS would_slug_to
FROM artist_tags at
LEFT JOIN public.genre_idf gi ON gi.genre_slug = public.genre_match_slug(at.genre)
WHERE gi.genre_slug IS NULL
ORDER BY at.artists DESC
LIMIT 25;

-- HOW TO READ IT
-- --------------
-- Q1 pct_rescued high  -> the fallback is worth shipping, and its size is
--     rescued_by_artist_genres events made personalisable for the first time.
--     still_unscorable is the residual enrichment backlog, not a ranker issue.
--
-- Q2 artist_richer large at event_tags = 1..3 -> extend the fallback to MERGE
--     artist genres into thin event tags, not just replace empty ones.
--     Otherwise keep the change minimal and only handle event_tags = 0.
--
-- Q3 pct_resolving low -> STOP. artists.genres uses a vocabulary genre_idf
--     does not know, and the fallback would score 0 across the board. Q4 names
--     what needs mapping first. This is the same failure mode as the
--     name-vs-slug bug, caught before shipping this time rather than after.
