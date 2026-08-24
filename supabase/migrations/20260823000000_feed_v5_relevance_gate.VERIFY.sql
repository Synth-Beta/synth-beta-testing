-- READ-ONLY. Run AFTER applying 20260823000000_feed_v5_relevance_gate.sql,
-- and BEFORE clearing the feed cache (this reads real locations out of it).
-- Nothing here writes.
--
-- Calls get_personalized_feed_v5 directly (bypassing the SWR cache) for the
-- 10 heaviest-signal users, at the location each of them actually last used,
-- then independently recomputes genre_sum / artist_sum for every event the
-- function put in the 'recommending' section.
--
-- This is the  after-number for the DIAGNOSTIC's pct_recommended_unrelated_now.

WITH sample_users AS (
  SELECT up.user_id, up.genre_preference_scores AS gs, up.artist_preference_scores AS a_s
  FROM public.user_preferences up
  WHERE (up.genre_preference_scores <> '{}'::jsonb OR up.artist_preference_scores <> '{}'::jsonb)
  ORDER BY up.signal_count DESC NULLS LAST
  LIMIT 10
),
-- Whatever lat/lng each user's feed was last actually served at. NULL if they
-- have no cache row, which just makes their call nationwide -- still a valid
-- check of the gate, only with a sparser candidate pool.
user_loc AS (
  SELECT su.user_id, su.gs, su.a_s,
         (SELECT c.city_lat FROM public.personalized_feed_cache c
          WHERE c.user_id = su.user_id ORDER BY c.created_at DESC LIMIT 1) AS lat,
         (SELECT c.city_lng FROM public.personalized_feed_cache c
          WHERE c.user_id = su.user_id ORDER BY c.created_at DESC LIMIT 1) AS lng
  FROM sample_users su
),
feed AS (
  SELECT ul.user_id, ul.gs, ul.a_s, f.section, f.id AS event_id
  FROM user_loc ul
  CROSS JOIN LATERAL public.get_personalized_feed_v5(
    p_user_id   => ul.user_id,
    p_limit     => 100,
    p_city_lat  => ul.lat,
    p_city_lng  => ul.lng
  ) f
  WHERE f.section = 'recommending'
),
rescored AS (
  SELECT
    fd.user_id,
    fd.event_id,
    -- Mirrors get_personalized_feed_v5 as of 20260824000000: slug-normalised
    -- and IDF-weighted. Before that migration this used the old
    -- [genre, LOWER(genre), REPLACE(genre,' ','')] variant expression, which
    -- is now a STALE YARDSTICK -- it cannot see an event matched via
    -- "indie rock" -> "indie-rock" and reports it as unmatched, producing
    -- phantom pct_unrelated_after. Keep this expression in sync with the
    -- function or the verify measures the wrong thing.
    COALESCE((
      SELECT SUM(COALESCE((fd.gs->>gi.genre_slug)::NUMERIC, 0) * gi.idf_norm)
             / POWER(GREATEST(COALESCE(array_length(e.genres, 1), 1), 1)::NUMERIC, 0.25)
      FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
      JOIN public.genre_idf gi ON gi.genre_slug = public.genre_match_slug(g.genre)
    ), 0) AS genre_sum,
    COALESCE((fd.a_s->>(e.artist_id::TEXT))::NUMERIC, 0) AS artist_sum
  FROM feed fd
  JOIN public.events e ON e.id = fd.event_id
)
SELECT
  user_id,
  COUNT(*)                                                          AS recommended_rows,
  COUNT(*) FILTER (WHERE genre_sum > 0 OR artist_sum > 0)           AS matched_rows,
  COUNT(*) FILTER (WHERE artist_sum > 0)                            AS artist_matched_rows,
  ROUND(100.0 * COUNT(*) FILTER (WHERE genre_sum = 0 AND artist_sum = 0)
        / NULLIF(COUNT(*), 0), 1)                                   AS pct_unrelated_after
FROM rescored
GROUP BY user_id
ORDER BY pct_unrelated_after DESC;

-- HOW TO READ IT
-- --------------
-- pct_unrelated_after
--     Should be ~0 for any user whose DIAGNOSTIC matched_events exceeded the
--     recommended slot count (50-75). Compare directly against that user's
--     pct_recommended_unrelated_now from the diagnostic.
--
-- Still high for some users?
--     Not a failure of the gate -- it means that user has fewer matched
--     events than slots inside the arbitrary `LIMIT 2500` candidate slice, so
--     the section is backfilling with unmatched events by design. Those users
--     are gated on the pool-selection fix (ORDER BY on the candidate CTE),
--     which is the next change. Cross-check with their matched_events from
--     the diagnostic to confirm that is what is happening.
--
-- artist_matched_rows near 0 across the board?
--     Expected today. artist_sum only fires for artists the user has DIRECTLY
--     signalled -- there is no artist-to-artist similarity anywhere in the
--     system yet. Recommended relevance is currently carried almost entirely
--     by genre. That is the third finding, and the largest remaining one.
