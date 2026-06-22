-- Get every unique genre value (token) across artists.genres and events.genres.
-- Unnests arrays so you get one row per distinct genre string, not per distinct array.

SELECT DISTINCT genre
FROM (
  SELECT unnest(genres) AS genre
  FROM artists
  WHERE genres IS NOT NULL
    AND array_length(genres, 1) > 0
  UNION
  SELECT unnest(genres) AS genre
  FROM events
  WHERE genres IS NOT NULL
    AND array_length(genres, 1) > 0
) combined
WHERE trim(genre) <> ''
ORDER BY genre;
