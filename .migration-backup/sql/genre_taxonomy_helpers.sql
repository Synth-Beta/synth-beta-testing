-- =============================================================================
-- DAG TAXONOMY: Query helpers for clustering and personalization
-- Run after genre_taxonomy_schema.sql (and after genre_paths is populated).
-- Genres in genre_taxonomy_exclude are excluded from results.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Genres under umbrella with depth cap (personalization rollups)
-- Use for "events under Rock", "user's preferred umbrellas", etc.
-- Default max_depth 5 keeps strong signal without very long chains.
-- Excludes genres in genre_taxonomy_exclude (drop list).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_genres_under_umbrella(p_slug text, p_max_depth int DEFAULT 5)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT p.genre_id
  FROM genre_paths p
  JOIN genres g ON g.id = p.genre_id
  WHERE (p.path_slug = p_slug OR p.path_slug LIKE p_slug || '.%')
    AND p.depth <= p_max_depth
    AND g.normalized_key NOT IN (SELECT normalized_key FROM genre_taxonomy_exclude);
$$;

-- -----------------------------------------------------------------------------
-- 2. Cluster keys at depth 0-2 (clustering artists/events)
-- One row per genre: umbrella_slug (depth 0) and cluster_path_slug (up to 2 segments).
-- Only genres with artist_count >= 5 and not in genre_taxonomy_exclude are included.
-- Use cluster_path_slug to group artists/events into interpretable clusters.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW genre_cluster_keys AS
WITH best_path AS (
  SELECT DISTINCT ON (p.genre_id) p.genre_id, p.path_slug, p.depth
  FROM genre_paths p
  JOIN genre_marginals m ON m.genre_id = p.genre_id AND m.artist_count >= 5
  JOIN genres g ON g.id = p.genre_id
  WHERE g.normalized_key NOT IN (SELECT normalized_key FROM genre_taxonomy_exclude)
  ORDER BY p.genre_id, p.depth ASC
)
SELECT
  genre_id,
  split_part(path_slug, '.', 1) AS umbrella_slug,
  CASE
    WHEN depth = 0 THEN path_slug
    ELSE split_part(path_slug, '.', 1) || '.' || split_part(path_slug, '.', 2)
  END AS cluster_path_slug
FROM best_path;
