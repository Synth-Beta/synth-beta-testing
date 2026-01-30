-- BACKFILL PART 3c: events_genres — batch 3 of 4

SET statement_timeout = '300s';

INSERT INTO events_genres (event_id, genre_id)
SELECT DISTINCT e.id, g.id
FROM events e
CROSS JOIN LATERAL unnest(e.genres) AS raw_genre
JOIN genres g ON g.normalized_key = normalize_genre_key(raw_genre)
WHERE e.genres IS NOT NULL
  AND array_length(e.genres, 1) > 0
  AND (abs(hashtext(e.id::text)) % 4) = 2
ON CONFLICT DO NOTHING;
