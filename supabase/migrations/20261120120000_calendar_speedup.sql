-- Calendar speedup (get_calendar_events). Applies FIX 1 + FIX 2 from
-- supabase/calendar-rpc-timeout-2026-08-21/03_proposed_fix.sql, which were never run.
--
-- Live timing before (2026-11-20, app arguments, p_limit 1000):
--   DC 50 mi: 7.3s   NYC 250 mi: 6.3s cold / 0.48s warm   no location: 1.4s
--
-- Why: the function's second branch (events with no own coordinates, located via their
-- venue) drives from venues: it scans the whole venues table, then probes events per venue,
-- to find the handful of upcoming events that have no coordinates. The partial index below
-- matches that branch's predicate exactly, so the planner can start from those few events.
--
-- No function body or signature change: no client change needed.
-- Building the index scans events once and blocks writes to events for those seconds.
-- Run when no JamBase sync is mid-flight.

CREATE INDEX IF NOT EXISTS idx_events_missing_coords
  ON public.events (event_date)
  WHERE latitude IS NULL OR longitude IS NULL;

-- calculate_distance is pure arithmetic on its four arguments (checked 2026-08-22), but is
-- marked VOLATILE COST 100, which forces per-row evaluation and blocks plan reordering.
ALTER FUNCTION public.calculate_distance(double precision, double precision, double precision, double precision)
  IMMUTABLE PARALLEL SAFE COST 10;

ANALYZE public.events;

-- After this ran: DC 50 mi went 7.3s -> 1.75s. The body's query alone is ~27ms, so the rest
-- is inside the function itself (not the cached plan: force_custom_plan was tried and did
-- not help). Next step if the calendar is still slow: rewrite the function body.
