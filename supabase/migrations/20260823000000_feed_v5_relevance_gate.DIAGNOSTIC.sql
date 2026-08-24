-- READ-ONLY. Run this BEFORE applying 20260823000000_feed_v5_relevance_gate.sql.
-- Nothing here writes. No CREATE, no INSERT, no UPDATE, no function replace.
--
-- Answers one question with a number instead of an argument:
--   "What share of the recommended section currently goes to events that
--    match nothing about the user?"
--
-- Efraimidis-Spirakis selects each row with probability proportional to the
-- sampler's divisor, so the expected share of picks landing on zero-match
-- events is exactly:
--     sum(effective_weight of unmatched) / sum(effective_weight of all)
-- computed below under BOTH the current formula and the proposed one.
--
-- Scoped to a nationwide candidate window (no geo filter) so it runs without
-- needing each user's last feed location. Absolute counts will differ from a
-- real request; the matched-vs-unmatched RATIO is the point.

WITH sample_users AS (
  SELECT user_id, genre_preference_scores AS gs, artist_preference_scores AS a_s
  FROM public.user_preferences
  WHERE (genre_preference_scores <> '{}'::jsonb OR artist_preference_scores <> '{}'::jsonb)
  ORDER BY signal_count DESC NULLS LAST
  LIMIT 15
),
cand AS (
  SELECT e.id, e.genres, e.artist_id, COALESCE(ep.total_count, 0) AS pop_count
  FROM public.events e
  LEFT JOIN public.event_popularity_scores ep ON ep.event_id = e.id
  WHERE e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
  LIMIT 2500
),
scored AS (
  SELECT
    su.user_id,
    GREATEST(COALESCE((
      SELECT SUM(COALESCE((su.gs->>k.variant)::NUMERIC, 0))
      FROM unnest(COALESCE(c.genres, ARRAY[]::TEXT[])) AS g(genre)
      CROSS JOIN LATERAL (
        SELECT DISTINCT v AS variant
        FROM unnest(ARRAY[g.genre, LOWER(g.genre), REPLACE(g.genre, ' ', '')]) AS v
      ) k
    ), 0), 0) AS genre_sum,
    GREATEST(COALESCE((su.a_s->>(c.artist_id::TEXT))::NUMERIC, 0), 0) AS artist_sum,
    c.pop_count
  FROM sample_users su
  CROSS JOIN cand c
),
weighted AS (
  SELECT
    user_id,
    (genre_sum > 0 OR artist_sum > 0) AS is_match,
    -- current: 1.0 base, divisor is total_weight + 1
    (1.0 + 6.0*LN(1.0+genre_sum) + 16.0*LN(1.0+artist_sum) + 4.0*LN(1.0+pop_count)) + 1.0
      AS eff_now,
    -- proposed: no base, divisor floored at 0.05
    GREATEST(6.0*LN(1.0+genre_sum) + 16.0*LN(1.0+artist_sum) + 4.0*LN(1.0+pop_count), 0.05)
      AS eff_new
  FROM scored
)
SELECT
  user_id,
  COUNT(*) FILTER (WHERE is_match)                             AS matched_events,
  COUNT(*)                                                     AS pool_size,
  ROUND(100.0 * SUM(eff_now) FILTER (WHERE NOT is_match) / NULLIF(SUM(eff_now),0), 1)
    AS pct_recommended_unrelated_now,
  ROUND(100.0 * SUM(eff_new) FILTER (WHERE NOT is_match) / NULLIF(SUM(eff_new),0), 1)
    AS pct_unrelated_new_before_gate
FROM weighted
GROUP BY user_id
ORDER BY pct_recommended_unrelated_now DESC;

-- HOW TO READ THE RESULT
-- ----------------------
-- pct_recommended_unrelated_now
--     Expected share of "recommended" slots going to zero-match events today.
--     Hypothesis under test: this is large (tens of percent). If it comes back
--     near 0 for everyone, the diagnosis is wrong and the migration should NOT
--     be applied -- the unrelated artists are coming from somewhere else.
--
-- pct_unrelated_new_before_gate
--     Same number after the weight change alone, WITHOUT the relevance gate.
--     Expected to drop but stay non-trivial -- this is the evidence that the
--     weight change alone is insufficient and the gate is doing the real work.
--     After the gate, this number goes to ~0 for any user whose matched_events
--     exceeds the recommended slot count (50-75).
--
-- matched_events vs pool_size
--     If matched_events is under ~75 for a user, the gate cannot fill the
--     section from matches alone and will still backfill with unmatched
--     events. Those users are blocked on the LIMIT 2500 pool-selection fix
--     (the next change), not on this one.
