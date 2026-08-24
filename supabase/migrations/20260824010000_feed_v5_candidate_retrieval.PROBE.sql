-- READ-ONLY. Nothing here writes. Run BEFORE the candidate-retrieval migration.
--
-- The migration replaces the candidate CTE's bare `LIMIT 2500` (arbitrary
-- scan-order slice) with a union of three targeted pulls, the largest of which
-- leans on the GIN index idx_events_genres via `genres && ARRAY[...]`.
--
-- The whole design rests on that overlap being index-backed. get_personalized_
-- feed_v5 has hit statement_timeout (57014) before and runs on a 15s budget,
-- so confirm the plan before shipping rather than after.
--
-- Q1 proves the index is used and measures the pull.
-- Q2 measures how much of the local window a typical user's tags actually
--    cover, which sizes the per-branch limits in the migration.

-- ── Q1: is the overlap index-backed, and how fast? ────────────────────────
-- Uses the heaviest user's top genre tags against a nationwide window (the
-- widest case; a real request also has the lat/lng box narrowing it further).
EXPLAIN (ANALYZE, BUFFERS)
WITH target AS (
  SELECT up.genre_preference_scores AS gs
  FROM public.user_preferences up
  WHERE up.genre_preference_scores <> '{}'::jsonb
  ORDER BY up.signal_count DESC NULLS LAST
  LIMIT 1
),
top_slugs AS (
  SELECT k.key AS slug
  FROM target t, LATERAL jsonb_each_text(t.gs) AS k(key, value)
  ORDER BY (k.value)::NUMERIC DESC
  LIMIT 20
),
-- Every raw surface form in the catalog that slugs to one of those.
match_tags AS (
  SELECT array_agg(DISTINCT g.genre) AS tags
  FROM public.events e
  CROSS JOIN LATERAL unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
  WHERE public.genre_match_slug(g.genre) IN (SELECT slug FROM top_slugs)
)
SELECT COUNT(*)
FROM public.events e, match_tags m
WHERE e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
  AND e.genres && m.tags;

-- ── Q2: how much of the window do a user's tags cover? ───────────────────
-- If matched_in_window is comfortably above the ~75 recommended slots for most
-- users, a modest genre branch limit is enough and the arbitrary-slice branch
-- can stay small. If it is huge (tens of thousands), the branch needs its own
-- ordering rather than a bare limit -- say so before applying.
WITH sample_users AS (
  SELECT up.user_id, up.genre_preference_scores AS gs
  FROM public.user_preferences up
  WHERE up.genre_preference_scores <> '{}'::jsonb
  ORDER BY up.signal_count DESC NULLS LAST
  LIMIT 10
),
loc AS (
  SELECT su.user_id, su.gs,
         (SELECT c.city_lat FROM public.personalized_feed_cache c
          WHERE c.user_id = su.user_id ORDER BY c.created_at DESC LIMIT 1) AS lat,
         (SELECT c.city_lng FROM public.personalized_feed_cache c
          WHERE c.user_id = su.user_id ORDER BY c.created_at DESC LIMIT 1) AS lng
  FROM sample_users su
),
tags AS (
  SELECT l.user_id, l.lat, l.lng,
         (SELECT array_agg(DISTINCT g.genre)
          FROM public.events e2
          CROSS JOIN LATERAL unnest(COALESCE(e2.genres, ARRAY[]::TEXT[])) AS g(genre)
          WHERE public.genre_match_slug(g.genre) IN (
            SELECT k.key FROM jsonb_each_text(l.gs) AS k(key, value)
            ORDER BY (k.value)::NUMERIC DESC LIMIT 20
          )) AS match_tags
  FROM loc l
)
SELECT
  t.user_id,
  COALESCE(array_length(t.match_tags, 1), 0) AS distinct_tag_forms,
  (SELECT COUNT(*) FROM public.events e
   WHERE e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
     AND e.genres && t.match_tags
     AND (t.lat IS NULL OR (
       e.latitude  BETWEEN t.lat - (50.0/69.0) AND t.lat + (50.0/69.0)
       AND e.longitude BETWEEN t.lng - (50.0/(69.0*COS(RADIANS(t.lat))))
                           AND t.lng + (50.0/(69.0*COS(RADIANS(t.lat))))
   ))) AS matched_in_window
FROM tags t
ORDER BY matched_in_window DESC;

-- NOTE ON Q2 RIGHT NOW
-- --------------------
-- personalized_feed_cache was just emptied by the CACHE_CLEAR step, so lat/lng
-- will come back NULL until real traffic repopulates it. That makes Q2
-- nationwide -- an UPPER bound on matched_in_window, not the real per-city
-- number. Still useful for sizing (it bounds the worst case), but do not read
-- the absolute values as what a real request sees.
--
-- HOW TO READ Q1
-- --------------
-- Want to see a Bitmap Index Scan on idx_events_genres in the plan. A Seq Scan
-- on events means the overlap is not using the index -- stop and fix that
-- before applying the migration, because the whole design assumes it.
