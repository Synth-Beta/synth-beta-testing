-- Support event-count-prioritized genre enrichment (scripts/enrich-artist-genres.mjs).
--
-- Two things:
-- 1. genre_lookup_attempted_at — a "we already tried this artist" marker, set
--    on every lookup attempt regardless of outcome (found or not). Without this,
--    an artist MusicBrainz/iTunes genuinely has no data for gets re-queried
--    forever on every run (the old id-ascending checkpoint only skipped already-
--    PASSED ids, not already-attempted ones, which happened to be equivalent
--    under strict id order but breaks once ordering changes).
-- 2. get_stuck_artists_by_event_count — serves the backlog ordered by how many
--    events an artist has (most first). Genre coverage is only ever user-facing
--    through events.genres, and event count per artist is highly skewed
--    (residencies/recurring bookings), so fixing a handful of high-traffic
--    artists moves the events-with-genres percentage far more than fixing the
--    same number of one-off local openers in arbitrary id order.

ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS genre_lookup_attempted_at timestamptz;

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
AS $$
  WITH stuck AS (
    SELECT a.id, a.name, a.identifier, a.external_identifiers, a.genres,
           count(e.id) AS event_count
    FROM public.artists a
    LEFT JOIN public.events e ON e.artist_id = a.id
    WHERE a.genre_lookup_attempted_at IS NULL
      AND (a.genres IS NULL OR a.genres = '{}' OR a.genres = ARRAY['small artist']::text[])
    GROUP BY a.id
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
