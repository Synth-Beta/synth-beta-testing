-- =============================================================================
-- BACKFILL PART 2a: artists_genres — batch 1 of 4 (use if part2 times out)
-- Run part2a, part2b, part2c, part2d in any order after Part 1.
-- =============================================================================

SET statement_timeout = '300s';

INSERT INTO artists_genres (artist_id, genre_id)
SELECT DISTINCT a.id, g.id
FROM artists a
CROSS JOIN LATERAL unnest(a.genres) AS raw_genre
JOIN genres g ON g.normalized_key = normalize_genre_key(raw_genre)
WHERE a.genres IS NOT NULL
  AND array_length(a.genres, 1) > 0
  AND (abs(hashtext(a.id::text)) % 4) = 0
ON CONFLICT DO NOTHING;
