-- =============================================================================
-- BACKFILL PART 3: Populate events_genres join table
-- Run after Part 2. If this times out, run part3a, part3b, part3c, part3d instead.
-- =============================================================================

SET statement_timeout = '600s';

INSERT INTO events_genres (event_id, genre_id)
SELECT DISTINCT e.id, g.id
FROM events e
CROSS JOIN LATERAL unnest(e.genres) AS raw_genre
JOIN genres g ON g.normalized_key = normalize_genre_key(raw_genre)
WHERE e.genres IS NOT NULL
  AND array_length(e.genres, 1) > 0
ON CONFLICT DO NOTHING;
