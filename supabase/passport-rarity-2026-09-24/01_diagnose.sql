-- Passport stamps / rarity — diagnosis. READ-ONLY, safe to run all at once.
-- 2026-09-24. Answers the questions the code alone cannot.

-- 1. Do stamps exist, and is rarity actually uniform?
SELECT rarity, type, count(*) AS stamps, count(DISTINCT user_id) AS users
FROM public.passport_entries
GROUP BY ROLLUP (rarity, type)
ORDER BY rarity NULLS LAST, type NULLS LAST;

-- 2. What is the column default? (Suspected: 'common', which every insert takes
--    because no client ever sets rarity.)
SELECT column_name, column_default, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'passport_entries'
ORDER BY ordinal_position;

-- 3. Are stamps still being created? If max(unlocked_at) is old, the writer died.
SELECT min(unlocked_at) AS first_stamp, max(unlocked_at) AS newest_stamp,
       count(*) AS total
FROM public.passport_entries;

-- 4. WHO writes them? No client code inserts into passport_entries, so if rows
--    are recent there must be a trigger or function doing it.
SELECT t.tgname, c.relname AS on_table, p.proname AS calls
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND (c.relname IN ('reviews', 'passport_entries', 'user_event_relationships')
       OR p.prosrc ILIKE '%passport_entries%')
ORDER BY c.relname, t.tgname;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ILIKE '%passport_entries%';

-- 5. Same two questions for the achievements half of the passport.
SELECT count(*) AS progress_rows, count(DISTINCT user_id) AS users,
       max(updated_at) AS newest
FROM public.user_achievement_progress;

-- 6. Is there enough signal to COMPUTE rarity? Event supply per artist is the
--    strongest catalog-side input and does not depend on Synth's user count.
SELECT
  count(*) FILTER (WHERE ev = 0)            AS artists_no_events,
  count(*) FILTER (WHERE ev BETWEEN 1 AND 2)  AS ev_1_2,
  count(*) FILTER (WHERE ev BETWEEN 3 AND 10) AS ev_3_10,
  count(*) FILTER (WHERE ev > 10)           AS ev_over_10,
  count(*)                                   AS artists_total
FROM (
  SELECT a.id, count(e.id) AS ev
  FROM public.artists a
  LEFT JOIN public.events e ON e.artist_id = a.id
  GROUP BY a.id
) s;

-- 7. num_upcoming_events coverage (the "touring scale" signal).
SELECT
  count(*) FILTER (WHERE num_upcoming_events IS NULL) AS null_rows,
  count(*) FILTER (WHERE num_upcoming_events = 0)     AS zero_rows,
  count(*) FILTER (WHERE num_upcoming_events > 0)     AS positive_rows,
  percentile_disc(0.5)  WITHIN GROUP (ORDER BY num_upcoming_events) AS p50,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY num_upcoming_events) AS p95,
  max(num_upcoming_events) AS max
FROM public.artists;

-- 8. How thin is Synth-internal scarcity today? (If most entities have exactly
--    one reviewer, peer-scarcity cannot drive rarity yet — catalog supply must.)
SELECT reviewers, count(*) AS artists
FROM (
  SELECT artist_id, count(DISTINCT user_id) AS reviewers
  FROM public.reviews
  WHERE artist_id IS NOT NULL AND is_draft = false
  GROUP BY artist_id
) s
GROUP BY reviewers
ORDER BY reviewers;
