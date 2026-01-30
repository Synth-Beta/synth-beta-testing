-- =============================================================================
-- DAG TAXONOMY: Validation script
-- Run after build_paths and helpers. Checks consistency and shows sample paths.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Counts
-- -----------------------------------------------------------------------------
SELECT 'genre_taxonomy_roots' AS object_name, count(*) AS row_count FROM genre_taxonomy_roots
UNION ALL SELECT 'genre_parent', count(*) FROM genre_parent
UNION ALL SELECT 'genre_paths', count(*) FROM genre_paths
UNION ALL SELECT 'genre_taxonomy_exclude (drop list)', count(*) FROM genre_taxonomy_exclude;

-- -----------------------------------------------------------------------------
-- 2. Roots have path_slug = slug, depth 0
-- -----------------------------------------------------------------------------
SELECT 'roots_with_paths' AS check_name, count(*) AS row_count
FROM genre_taxonomy_roots r
JOIN genre_paths p ON p.genre_id = r.genre_id AND p.depth = 0
JOIN genres g ON g.id = r.genre_id AND g.slug = p.path_slug;

-- -----------------------------------------------------------------------------
-- 3. Every genre in genre_parent has at least one path (no orphan children)
-- -----------------------------------------------------------------------------
SELECT 'orphan_children_no_path' AS check_name, count(*) AS row_count
FROM genre_parent gp
WHERE gp.child_id NOT IN (SELECT genre_id FROM genre_paths);
-- Expect 0

-- -----------------------------------------------------------------------------
-- 4. Cluster keys: genres with artist_count >= 5 only
-- -----------------------------------------------------------------------------
SELECT 'cluster_keys_count' AS check_name, count(*) AS row_count FROM genre_cluster_keys;

-- -----------------------------------------------------------------------------
-- 5. Sample paths with human-readable chain (genre names)
-- -----------------------------------------------------------------------------
WITH sample_paths AS (
  SELECT path_slug, depth
  FROM genre_paths
  WHERE depth BETWEEN 1 AND 4
  ORDER BY random()
  LIMIT 5
),
segments AS (
  SELECT sp.path_slug, sp.depth, ord AS seg_pos, seg AS slug
  FROM sample_paths sp,
       unnest(string_to_array(sp.path_slug, '.')) WITH ORDINALITY AS t(seg, ord)
),
with_names AS (
  SELECT s.path_slug, s.depth, s.seg_pos, g.name
  FROM segments s
  JOIN genres g ON g.slug = s.slug
)
SELECT path_slug, depth, string_agg(name, ' → ' ORDER BY seg_pos) AS path_display
FROM with_names
GROUP BY path_slug, depth
ORDER BY depth, path_slug;

-- -----------------------------------------------------------------------------
-- 6. Fixed sample: one path under "rock" (depth 2–4) with full chain
-- -----------------------------------------------------------------------------
WITH one_path AS (
  SELECT path_slug, depth
  FROM genre_paths
  WHERE path_slug LIKE 'rock.%' AND depth BETWEEN 2 AND 4
  ORDER BY depth DESC
  LIMIT 1
),
segments AS (
  SELECT op.path_slug, op.depth, ord AS seg_pos, seg AS slug
  FROM one_path op,
       unnest(string_to_array(op.path_slug, '.')) WITH ORDINALITY AS t(seg, ord)
),
with_names AS (
  SELECT s.path_slug, s.depth, s.seg_pos, g.name
  FROM segments s
  JOIN genres g ON g.slug = s.slug
)
SELECT path_slug, depth, string_agg(name, ' → ' ORDER BY seg_pos) AS path_display
FROM with_names
GROUP BY path_slug, depth;
