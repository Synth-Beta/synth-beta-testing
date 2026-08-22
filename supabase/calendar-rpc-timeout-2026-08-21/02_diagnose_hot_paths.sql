-- Calendar RPC — round 2 diagnosis, 2026-08-21
-- READ-ONLY. Nothing here changes schema, data, or functions.
--
-- What round 1 settled:
--   * get_calendar_events is SECURITY DEFINER, STABLE, search_path pinned — fine.
--   * anon statement_timeout = 3s, authenticated = 8s.
--   * 122,635 upcoming events.
--   * The no-location branch was the main offender and is now handled CLIENT-SIDE:
--     PostgREST caps responses at 1000 rows, so p_limit 10000 produced 9,000 rows
--     nobody could ever see while sorting/spilling to disk (temp read=984 written=984
--     in the round-1 plan). Measured over PostgREST:
--        no-location, p_limit 10000 -> 3.10s / 3.17s TIMEOUT, 0.90s
--        no-location, p_limit  1000 -> 0.40s / 0.41s (one 2.27s cold start)
--     Mobile + web now pass p_limit 1000. No behaviour change: the extra rows were
--     already being discarded by PostgREST.
--
-- What is still unexplained and needs these plans: the LOCATED branch degrades with
-- radius and p_limit does not help it.
--        NYC radius  30, p_limit 10000 -> 0.44s
--        NYC radius  50, p_limit 10000 -> 0.31s steady (2.06s cold)
--        NYC radius 100, p_limit 10000 -> TIMEOUT cold
--        NYC radius 250, p_limit  1000 -> TIMEOUT   <-- limit makes no difference
--        NYC radius 250, p_limit 10000 -> TIMEOUT
--   Mobile clamps radius to 5-50 so it is safe today, but web has no such clamp and
--   50mi is only ~2x off the cliff.

-- ---------------------------------------------------------------------------
-- 1. Inner plan for the located branch. EXPLAIN on the function itself only shows
--    "Function Scan", so the branch is inlined here verbatim to expose the real plan.
--    Run at radius 250 (the failing case). If it cancels, drop to 100.
-- ---------------------------------------------------------------------------
SET LOCAL statement_timeout = '120s';

EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE)
WITH params AS (
  SELECT
    40.7128::numeric AS lat,
    -74.0060::numeric AS lng,
    250::numeric AS radius,
    now() AS min_date
),
box AS (
  SELECT
    lat, lng, radius, min_date,
    lat - (radius / 69.0) * 1.1 AS min_lat,
    lat + (radius / 69.0) * 1.1 AS max_lat,
    lng - (radius / (69.0 * COS(RADIANS(lat)))) * 1.1 AS min_lng,
    lng + (radius / (69.0 * COS(RADIANS(lat)))) * 1.1 AS max_lng
  FROM params
),
combined_events AS (
  SELECT e.id, e.event_date,
         calculate_distance(b.lat::float, b.lng::float, e.latitude::float, e.longitude::float)::numeric AS calc_distance
  FROM public.events e
  CROSS JOIN box b
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues  v ON v.id = e.venue_id
  WHERE e.latitude IS NOT NULL
    AND e.longitude IS NOT NULL
    AND e.latitude  BETWEEN b.min_lat AND b.max_lat
    AND e.longitude BETWEEN b.min_lng AND b.max_lng
    AND e.event_date >= b.min_date

  UNION ALL

  SELECT e.id, e.event_date,
         calculate_distance(b.lat::float, b.lng::float, v.latitude::float, v.longitude::float)::numeric AS calc_distance
  FROM public.events e
  CROSS JOIN box b
  LEFT JOIN public.artists a ON a.id = e.artist_id
  INNER JOIN public.venues v ON v.id = e.venue_id
  WHERE (e.latitude IS NULL OR e.longitude IS NULL)
    AND v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND v.latitude  BETWEEN b.min_lat AND b.max_lat
    AND v.longitude BETWEEN b.min_lng AND b.max_lng
    AND e.event_date >= b.min_date
)
SELECT ce.id
FROM combined_events ce, box b
WHERE ce.calc_distance <= b.radius
ORDER BY ce.event_date ASC
LIMIT 1000;

-- 2. How many candidate rows each branch of that UNION has to consider, and how
--    many survive the exact-distance filter. If branch 1 pulls a huge latitude band
--    and throws most of it away, the bounding box is the problem, not the sort.
SELECT
  count(*) FILTER (WHERE e.latitude IS NOT NULL AND e.longitude IS NOT NULL) AS branch1_events_with_coords,
  count(*) FILTER (WHERE e.latitude IS NULL OR e.longitude IS NULL)          AS branch2_events_needing_venue
FROM public.events e
WHERE e.event_date >= now();

-- 3. Does calculate_distance get evaluated per candidate row? Check its volatility —
--    an IMMUTABLE/STABLE marking lets the planner hoist far more than VOLATILE does.
SELECT
  p.oid::regprocedure AS signature,
  CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS volatility,
  p.procost
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'calculate_distance';

-- 4. Branch 2 filters on venues.latitude/longitude — is that indexed?
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'venues'
ORDER BY indexname;

-- ---------------------------------------------------------------------------
-- 5. SEPARATE BUG: events_with_artist_venue returns every event TWICE.
--    Confirmed in round 1 — the duplicate-id probe matched essentially every id
--    sampled, each with copies = 2. Suspected join fan-out against
--    external_entity_ids: after the 2026-07-12 venue dedup one canonical venue can
--    carry several jambase ids, and this view exposes artist/venue/event jambase_id
--    columns. Anything reading this view is double-counting right now.
-- ---------------------------------------------------------------------------
SELECT pg_get_viewdef('public.events_with_artist_venue'::regclass, true) AS view_definition;

-- Scale of the duplication.
SELECT
  (SELECT count(*) FROM public.events_with_artist_venue) AS view_rows,
  (SELECT count(*) FROM public.events)                   AS base_rows;

-- NOTE: the two queries that were here referenced a column `id_type` that does not
-- exist on external_entity_ids and errored. Corrected versions live in
-- 03_proposed_fix.sql. Actual columns: id, entity_type, entity_uuid, source,
-- external_id, created_at, updated_at.
