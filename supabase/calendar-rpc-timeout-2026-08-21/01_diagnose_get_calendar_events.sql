-- Calendar RPC timeout diagnosis — 2026-08-21
-- READ-ONLY. Nothing here changes schema, data, or functions.
--
-- Symptom: mobile Discover → Calendar showed
--   "Could not load events: column events.artist_name does not exist"
-- That message came from the CLIENT FALLBACK, not the real failure. The real
-- failure is get_calendar_events intermittently hitting the statement timeout.
--
-- Measured live against prod via PostgREST (anon role, 3s statement timeout):
--   coords NYC, radius 30,  p_limit 10000  -> 200 in 0.44s
--   coords NYC, radius 50,  p_limit 10000  -> 200 in 2.06s   (marginal)
--   coords NYC, radius 100, p_limit 10000  -> 500 57014 timeout (cold cache)
--   coords NYC, radius 250, p_limit 1500   -> 200 in 2.59s   (marginal)
--   no coords,              p_limit 10000  -> 500 57014 timeout (cold cache)
--   no coords,              p_limit 10000  -> 200 in 0.30s   (warm, same call)
-- i.e. the function is not broken, it is sitting right on the timeout budget and
-- tips over on a cold buffer cache. Authenticated role gets a larger budget
-- (typically 8s) so users see this intermittently rather than always.

-- 1. What does the function actually do? (both overloads, if there are two)
SELECT
  p.oid::regprocedure AS signature,
  p.prosecdef         AS is_security_definer,
  p.proconfig         AS settings,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_calendar_events';

-- 2. Statement timeout per role — confirms the budget the RPC has to fit in.
SELECT rolname, rolconfig
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'authenticator', 'service_role');

-- 3. Indexes available on events for the date + spatial predicates.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'events'
ORDER BY indexname;

-- 4. Is there a usable index for "upcoming events ordered by date"?
--    A partial/composite index on (event_date) with lat/lng, or a GiST index on
--    a geography/geometry column, is what keeps this off a full scan.
SELECT
  s.indexrelname,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
FROM pg_stat_user_indexes s
WHERE s.schemaname = 'public'
  AND s.relname = 'events'
ORDER BY s.idx_scan DESC;

-- 5. Plan + real timings for the failing shape (no location filter, big limit).
--    Run this one on its own; it is the expensive case.
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT * FROM public.get_calendar_events(
  p_latitude      => NULL,
  p_longitude     => NULL,
  p_radius_miles  => NULL,
  p_min_date      => now(),
  p_genres        => NULL,
  p_limit         => 10000,
  p_umbrella_slug => NULL,
  p_max_depth     => 5
);

-- 6. Plan + real timings for the marginal located shape (wide radius).
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT * FROM public.get_calendar_events(
  p_latitude      => 40.7128,
  p_longitude     => -74.0060,
  p_radius_miles  => 50,
  p_min_date      => now(),
  p_genres        => NULL,
  p_limit         => 10000,
  p_umbrella_slug => NULL,
  p_max_depth     => 5
);

-- 7. How many rows the predicate has to consider at all.
SELECT count(*) AS upcoming_events
FROM public.events
WHERE event_date >= now();

-- 8. Related: the events_with_artist_venue view exposes artist_name_normalized /
--    venue_name_normalized (NOT artist_name / venue_name), and it returned a
--    duplicated event id in a 3-row sample — check the join fan-out.
SELECT pg_get_viewdef('public.events_with_artist_venue'::regclass, true) AS view_definition;

SELECT id, count(*) AS copies
FROM public.events_with_artist_venue
GROUP BY id
HAVING count(*) > 1
LIMIT 20;
