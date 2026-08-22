-- Calendar RPC timeout — PROPOSED FIX, 2026-08-22
--
-- ⚠ REVIEW BEFORE APPLYING. Nothing in here has been run against the database.
-- ⚠ Run statement by statement in the Supabase editor, never as one paste — the editor
--   wraps a multi-statement paste in a transaction, and CREATE INDEX CONCURRENTLY
--   cannot run inside one.
--
-- ===========================================================================
-- FINDING: branch 2 of the UNION costs 75% of the query and returns nothing
-- ===========================================================================
-- From the round-2 plan (NYC, radius 250, p_limit 1000, total 3,415ms):
--
--   Append (actual time=653.868..3400.367 rows=11604)
--     -> Nested Loop  (actual  653.867..813.051   rows=11604)   <- branch 1, events w/ coords
--     -> Nested Loop  (actual 2585.805..2585.806  rows=0)       <- branch 2, events w/o coords
--          -> Seq Scan on venues (rows=26421), bbox as a join filter
--             Rows Removed by Join Filter: 24145  -> 2276 venues survive
--          -> Index Scan idx_events_venue_id on events (loops=2276, 1.118ms each)
--                Filter: (latitude IS NULL OR longitude IS NULL)
--                Rows Removed by Filter: 14
--
-- Branch 2 spends 2.59s of a 3s anon budget to produce ZERO rows. It drives from the
-- wrong side: 26,421 venues seq-scanned, then ~14 events probed per surviving venue,
-- to find events that almost never exist.
--
-- How rare: 79 of 277,781 events have no coordinates (0.028%), and only 9 of those
-- are upcoming. Branch 2 walks the venue table to serve nine rows.
--
-- Secondary finding: calculate_distance is VOLATILE with COST 100. It is pure
-- trigonometry on four floats. VOLATILE stops the planner hoisting or reordering it
-- and forces per-row evaluation — 11,604 calls in the plan above.
--
-- Not a priority: branch 1's bitmap scan on idx_events_geo_date_covering
-- (latitude, longitude, event_date) read 33,061 rows and dropped 21,389 on the
-- longitude recheck, because only `latitude` is a usable leading range. It still
-- came in at 813ms for a 250-mile radius, and the app clamps to 50.

-- ===========================================================================
-- FIX 1 — let branch 2 find its nine rows directly instead of via 26k venues
-- ===========================================================================
-- Matches branch 2's predicate exactly, so the planner can drive from events.
-- 79 rows today: the index is a few KB.
--
-- Preferred (no write lock, but CANNOT run inside a transaction — paste alone):
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_missing_coords
  ON public.events (event_date)
  WHERE latitude IS NULL OR longitude IS NULL;

-- If CONCURRENTLY is refused by the editor, this is the transaction-safe form. It
-- takes a SHARE lock on events (blocks writes) for the duration of one scan of
-- 277k rows — seconds, but do not run it while a JamBase sync is mid-flight:
--   CREATE INDEX IF NOT EXISTS idx_events_missing_coords
--     ON public.events (event_date)
--     WHERE latitude IS NULL OR longitude IS NULL;

ANALYZE public.events;

-- Verify the planner flipped: branch 2 should now be an index scan on
-- idx_events_missing_coords with loops=1, not a Seq Scan on venues.
-- Re-run section 1 of 02_diagnose_hot_paths.sql and compare the Append node.

-- ===========================================================================
-- FIX 2 — stop treating pure trigonometry as VOLATILE
-- ===========================================================================
-- PRECONDITION — CHECKED AND CLEARED 2026-08-22. The body is:
--     RETURN 3959 * acos(cos(radians(lat1)) * cos(radians(lat2))
--                      * cos(radians(lon2) - radians(lon1))
--                      + sin(radians(lat1)) * sin(radians(lat2)));
-- Pure arithmetic on its four arguments. No table access, no now(), no random(),
-- no session state. IMMUTABLE is correct.
--
-- Verified 2026-08-22 that this had NOT been applied: provolatile='v', procost=100.
ALTER FUNCTION public.calculate_distance(double precision, double precision, double precision, double precision)
  IMMUTABLE PARALLEL SAFE COST 10;

-- Confirm: expect i / 10.
SELECT provolatile, procost FROM pg_proc WHERE proname = 'calculate_distance';

-- ---------------------------------------------------------------------------
-- NOT RECOMMENDED right now, recorded so it is not rediscovered later
-- ---------------------------------------------------------------------------
-- calculate_distance is LANGUAGE plpgsql with SET search_path. Both of those block
-- the planner from inlining it, so every call pays plpgsql entry plus a GUC
-- save/restore — ~11,600 times per wide-radius query. Rewriting it as a bare
-- LANGUAGE SQL IMMUTABLE function with no SET clause would let the planner inline
-- the arithmetic into the query entirely.
--
-- Not doing it, for two reasons: the search_path pin came from the 2026-07-10
-- security review and dropping it re-trips the function_search_path_mutable lint;
-- and after FIX 1 the query is 0.28s at the radius the app actually uses, so the
-- remaining call overhead is worth roughly 15ms there. Revisit only if the located
-- branch shows up hot again.

-- ===========================================================================
-- FIX 3 — optional, larger: give the function an upper date bound
-- ===========================================================================
-- The clients now load one month at a time, but get_calendar_events has no
-- p_max_date, so `event_date >= p_min_date` stays an open-ended range and the
-- planner cannot use idx_events_date_location (event_date, latitude, longitude) —
-- which currently shows 2 lifetime scans, i.e. it is dead weight being maintained
-- on every write. Adding p_max_date would make the month-scoped calls bounded on
-- both ends and let that existing index carry the located branch.
--
-- This changes the function signature, so it needs its own reviewed migration and a
-- client change to pass the bound. Not written here — flagging the opportunity.

-- ===========================================================================
-- SEPARATE: corrected external_entity_ids probe
-- ===========================================================================
-- The version in 02_diagnose_hot_paths.sql referenced a column that does not exist
-- (`id_type`) and errored out. Actual columns: id, entity_type, entity_uuid, source,
-- external_id, created_at, updated_at.
SELECT entity_type, source, count(*) AS mappings, count(DISTINCT entity_uuid) AS entities
FROM public.external_entity_ids
GROUP BY 1, 2
ORDER BY mappings DESC
LIMIT 20;

-- Entities carrying more than one external id — the suspected fan-out behind
-- events_with_artist_venue returning every event twice.
SELECT entity_uuid, entity_type, source, count(*) AS ids
FROM public.external_entity_ids
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY ids DESC
LIMIT 20;

-- Still needed to fix the duplicate-row view — this one was not returned last round:
SELECT pg_get_viewdef('public.events_with_artist_venue'::regclass, true) AS view_definition;
