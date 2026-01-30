-- =============================================================================
-- DAG TAXONOMY: Rebuild materialized paths from roots + genre_parent
-- Run after genre_taxonomy_assign_from_similarity.sql.
-- =============================================================================

SET statement_timeout = '600s';

TRUNCATE genre_paths;

-- Roots: one path per root (path_slug = slug, depth = 0)
INSERT INTO genre_paths (genre_id, path_slug, depth)
SELECT g.id, g.slug, 0
FROM genres g
JOIN genre_taxonomy_roots r ON r.genre_id = g.id;

-- Children: recursive walk from roots; one row per root-to-genre path
INSERT INTO genre_paths (genre_id, path_slug, depth)
WITH RECURSIVE walk AS (
  SELECT g.id AS genre_id, g.slug AS path_slug, 0 AS depth
  FROM genres g
  JOIN genre_taxonomy_roots r ON r.genre_id = g.id
  UNION ALL
  SELECT g.id, w.path_slug || '.' || g.slug, w.depth + 1
  FROM genre_parent gp
  JOIN walk w ON w.genre_id = gp.parent_id
  JOIN genres g ON g.id = gp.child_id
)
SELECT genre_id, path_slug, depth FROM walk
WHERE depth > 0
ON CONFLICT (genre_id, path_slug) DO UPDATE SET depth = EXCLUDED.depth;
