-- READ-ONLY. Nothing here writes. Run BEFORE applying the IDF migration.
--
-- Shows, for the heaviest-signal user, the top 12 candidate events under the
-- CURRENT genre scoring next to the top 12 under the PROPOSED scoring, with
-- the genre tags visible so the difference is eyeballable rather than taken on
-- faith.
--
-- CURRENT:  SUM(user_score[variant])            -- flat, every tag equal
-- PROPOSED: SUM(user_score[slug] * idf_norm)    -- rare tags dominate
--             / SQRT(tag_count)                 -- multi-tag inflation damped
--
-- idf_norm is IDF divided by the OCCURRENCE-weighted mean IDF (not the mean
-- over distinct genres -- that would be dragged up by the long tail of
-- ultra-rare tags and shrink every common genre). Weighting by occurrence
-- makes a typical tag on a typical event land at idf_norm ~= 1.0, which keeps
-- the existing 6.0 genre coefficient calibrated and avoids a second round of
-- hand-tuning.

WITH target AS (
  SELECT up.user_id, up.genre_preference_scores AS gs
  FROM public.user_preferences up
  WHERE up.genre_preference_scores <> '{}'::jsonb
  ORDER BY up.signal_count DESC NULLS LAST
  LIMIT 1
),
loc AS (
  SELECT t.user_id, t.gs,
         (SELECT c.city_lat FROM public.personalized_feed_cache c
          WHERE c.user_id = t.user_id ORDER BY c.created_at DESC LIMIT 1) AS lat,
         (SELECT c.city_lng FROM public.personalized_feed_cache c
          WHERE c.user_id = t.user_id ORDER BY c.created_at DESC LIMIT 1) AS lng
  FROM target t
),
-- Same IDF the migration will materialise, computed inline here so this
-- preview needs nothing to exist yet.
upcoming AS (
  SELECT e.id, e.genres FROM public.events e
  WHERE e.event_date BETWEEN now() AND now() + INTERVAL '180 days'
),
tot AS (SELECT GREATEST(COUNT(*),1)::NUMERIC AS n FROM upcoming),
freq AS (
  SELECT public.genre_match_slug(g.genre) AS genre_slug, COUNT(*)::NUMERIC AS event_count
  FROM upcoming u
  CROSS JOIN LATERAL unnest(COALESCE(u.genres, ARRAY[]::TEXT[])) AS g(genre)
  WHERE public.genre_match_slug(g.genre) IS NOT NULL
  GROUP BY 1
),
idf AS (
  SELECT genre_slug,
         event_count,
         LN((SELECT n FROM tot) / event_count) AS idf_raw,
         LN((SELECT n FROM tot) / event_count)
           / NULLIF(SUM(LN((SELECT n FROM tot)/event_count) * event_count) OVER ()
                    / NULLIF(SUM(event_count) OVER (), 0), 0) AS idf_norm
  FROM freq
),
cand AS (
  SELECT e.id, e.title, e.genres, a.name AS artist_name
  FROM public.events e
  LEFT JOIN public.artists a ON a.id = e.artist_id
  CROSS JOIN loc l
  WHERE e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
    AND (l.lat IS NULL OR (
      e.latitude  BETWEEN l.lat - (50.0/69.0) AND l.lat + (50.0/69.0)
      AND e.longitude BETWEEN l.lng - (50.0/(69.0*COS(RADIANS(l.lat))))
                          AND l.lng + (50.0/(69.0*COS(RADIANS(l.lat))))
    ))
  LIMIT 2500
),
scored AS (
  SELECT
    c.artist_name,
    c.genres,
    -- current: the exact variant expression live in get_personalized_feed_v5
    COALESCE((
      SELECT SUM(COALESCE((l.gs->>k.variant)::NUMERIC, 0))
      FROM unnest(COALESCE(c.genres, ARRAY[]::TEXT[])) AS g(genre)
      CROSS JOIN LATERAL (
        SELECT DISTINCT v AS variant
        FROM unnest(ARRAY[g.genre, LOWER(g.genre), REPLACE(g.genre, ' ', '')]) AS v
      ) k
    ), 0) AS score_now,
    -- proposed: slug-normalised, IDF-weighted, tag-count damped
    COALESCE((
      SELECT SUM(COALESCE((l.gs->>i.genre_slug)::NUMERIC, 0) * i.idf_norm)
             -- SQRT() returns double precision; cast back or the whole
             -- expression becomes float and ROUND(float, int) does not exist.
             / SQRT(GREATEST(COALESCE(array_length(c.genres,1),1), 1))::NUMERIC
      FROM unnest(COALESCE(c.genres, ARRAY[]::TEXT[])) AS g(genre)
      JOIN idf i ON i.genre_slug = public.genre_match_slug(g.genre)
    ), 0) AS score_new
  FROM cand c CROSS JOIN loc l
)
(SELECT 'TOP_12_NOW' AS ranking, artist_name, genres,
        ROUND(score_now,2) AS score_now, ROUND(score_new,2) AS score_new
 FROM scored WHERE score_now > 0 ORDER BY score_now DESC LIMIT 12)
UNION ALL
(SELECT 'TOP_12_PROPOSED', artist_name, genres,
        ROUND(score_now,2), ROUND(score_new,2)
 FROM scored WHERE score_new > 0 ORDER BY score_new DESC LIMIT 12);

-- HOW TO READ IT
-- --------------
-- Compare the two blocks by eye. The proposed block should be visibly more
-- specific -- events whose tags are the user's narrow interests rather than
-- events carrying 'rock' or 'pop'. If both blocks are near-identical, IDF is
-- not buying anything here and the migration should be skipped.
--
-- Also check: does TOP_12_PROPOSED contain any event with a space-separated
-- tag ('indie rock', 'hip hop')? Those score 0 under the current expression
-- and are currently invisible to genre personalisation entirely. Seeing them
-- appear is the slug-normalisation half of the fix working.
--
-- If score_new is uniformly ~3x score_now rather than reordering things, the
-- occurrence-weighted normalisation is off and the 6.0 coefficient would need
-- retuning -- say so before applying rather than shipping a silent
-- recalibration.
