-- =============================================================================
-- BACKFILL PART 1: Populate genres table only
-- Run this first. Increase timeout so Supabase doesn't kill the query.
-- =============================================================================

SET statement_timeout = '600s';

-- From artists (smaller set first)
INSERT INTO genres (name, normalized_key, slug)
SELECT DISTINCT
  initcap(normalize_genre_key(g)) AS name,
  normalize_genre_key(g) AS normalized_key,
  replace(normalize_genre_key(g), ' ', '-') AS slug
FROM (
  SELECT unnest(genres) AS g FROM artists
  WHERE genres IS NOT NULL AND array_length(genres, 1) > 0
) raw
WHERE normalize_genre_key(g) IS NOT NULL
  AND length(normalize_genre_key(g)) >= 2
ON CONFLICT (normalized_key) DO NOTHING;

-- From events (separate statement to avoid one huge UNION)
INSERT INTO genres (name, normalized_key, slug)
SELECT DISTINCT
  initcap(normalize_genre_key(g)) AS name,
  normalize_genre_key(g) AS normalized_key,
  replace(normalize_genre_key(g), ' ', '-') AS slug
FROM (
  SELECT unnest(genres) AS g FROM events
  WHERE genres IS NOT NULL AND array_length(genres, 1) > 0
) raw
WHERE normalize_genre_key(g) IS NOT NULL
  AND length(normalize_genre_key(g)) >= 2
ON CONFLICT (normalized_key) DO NOTHING;
