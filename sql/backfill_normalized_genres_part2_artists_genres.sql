-- =============================================================================
-- BACKFILL PART 2: Populate artists_genres join table
-- Run after Part 1. If this times out, run part2a, part2b, part2c, part2d instead.
-- =============================================================================

SET statement_timeout = '600s';

INSERT INTO artists_genres (artist_id, genre_id)
SELECT DISTINCT a.id, g.id
FROM artists a
CROSS JOIN LATERAL unnest(a.genres) AS raw_genre
JOIN genres g ON g.normalized_key = normalize_genre_key(raw_genre)
WHERE a.genres IS NOT NULL
  AND array_length(a.genres, 1) > 0
ON CONFLICT DO NOTHING;
