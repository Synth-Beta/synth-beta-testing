-- Backfill events.genres from the corresponding artist for events with empty genres.
-- BATCHED: updates 2000 rows per run to avoid statement timeout.
-- Run this script repeatedly until "UPDATE 0" (then all done).
--
-- Optional: raise timeout for this session only (e.g. 5 min) to run one big update:
--   SET statement_timeout = '300s';
--
-- Optional: verify counts before running
--   SELECT count(*) AS events_with_empty_genres FROM events
--   WHERE genres IS NULL OR genres = '{}'::text[] OR array_length(genres, 1) IS NULL OR array_length(genres, 1) = 0;

BEGIN;

WITH candidates AS (
  SELECT e.id AS event_id, a.genres AS artist_genres
  FROM events e
  JOIN artists a ON e.artist_id = a.id
  WHERE a.genres IS NOT NULL
    AND array_length(a.genres, 1) > 0
    AND (
      e.genres IS NULL
      OR e.genres = '{}'::text[]
      OR array_length(e.genres, 1) IS NULL
      OR array_length(e.genres, 1) = 0
    )
  LIMIT 2000
)
UPDATE events e
SET
  genres = c.artist_genres,
  updated_at = now()
FROM candidates c
WHERE e.id = c.event_id;

COMMIT;
