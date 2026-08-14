-- Fix: get_stuck_artists_by_event_count() (20260813000000) timed out in
-- practice — "canceling statement due to statement timeout" when called via
-- the service-role API connection, whose default statement_timeout is
-- shorter than this needs. The original LEFT JOIN + GROUP BY over the full
-- artists x events cross-section was also just more work than necessary.
--
-- Two fixes, applied together:
-- 1. A partial index on artists matching the exact "stuck and unattempted"
--    predicate the function filters on — narrows the artists side from all
--    51,570 rows to only the (shrinking, as attempts accumulate) backlog.
-- 2. Redefine the function using a per-artist correlated subquery for
--    event_count instead of a join+aggregate — lets Postgres use the
--    existing idx_events_artist_id index (added in
--    20260701000000_feed_performance_indexes.sql) directly per artist,
--    and set an explicit statement_timeout on the function itself so it
--    isn't at the mercy of whatever the calling connection's default is.

CREATE INDEX IF NOT EXISTS idx_artists_genre_lookup_pending
ON public.artists (id)
WHERE genre_lookup_attempted_at IS NULL
  AND (genres IS NULL OR genres = '{}' OR genres = ARRAY['small artist']::text[]);

CREATE OR REPLACE FUNCTION public.get_stuck_artists_by_event_count(
  p_after_event_count integer DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  name text,
  identifier text,
  external_identifiers jsonb,
  genres text[],
  event_count bigint
)
LANGUAGE sql
STABLE
SET statement_timeout = '60s'
AS $$
  WITH stuck AS (
    SELECT a.id, a.name, a.identifier, a.external_identifiers, a.genres,
           (SELECT count(*) FROM public.events e WHERE e.artist_id = a.id) AS event_count
    FROM public.artists a
    WHERE a.genre_lookup_attempted_at IS NULL
      AND (a.genres IS NULL OR a.genres = '{}' OR a.genres = ARRAY['small artist']::text[])
  )
  SELECT stuck.id, stuck.name, stuck.identifier, stuck.external_identifiers, stuck.genres, stuck.event_count
  FROM stuck
  WHERE p_after_id IS NULL
     OR (stuck.event_count < p_after_event_count)
     OR (stuck.event_count = p_after_event_count AND stuck.id > p_after_id)
  ORDER BY stuck.event_count DESC, stuck.id ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_stuck_artists_by_event_count(integer, uuid, integer) TO service_role;
