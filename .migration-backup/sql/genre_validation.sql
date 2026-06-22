-- =============================================================================
-- GENRE PIPELINE: VALIDATION SCRIPT
-- Run after genre_one_time_full_run.sql (or after any refresh) to sanity-check
-- Phase 1 (3NF backfill), Phase 2 (similarity graph), Phase 3 (DAG taxonomy).
-- =============================================================================

-- ############################################################################
-- PHASE 1: 3NF NORMALIZATION — Backfill counts
-- ############################################################################

SELECT '--- Phase 1: 3NF backfill ---' AS section;

SELECT table_name, row_count
FROM (
  SELECT 'genres' AS table_name, count(*)::bigint AS row_count FROM genres
  UNION ALL SELECT 'artists_genres', count(*) FROM artists_genres
  UNION ALL SELECT 'events_genres', count(*) FROM events_genres
  UNION ALL SELECT 'artists with genres', count(DISTINCT artist_id) FROM artists_genres
  UNION ALL SELECT 'events with genres', count(DISTINCT event_id) FROM events_genres
) t;

-- ############################################################################
-- PHASE 2: SIMILARITY GRAPH — Counts and sample
-- ############################################################################

SELECT '--- Phase 2: Similarity graph ---' AS section;

SELECT object_name, row_count
FROM (
  SELECT 'genre_cooccurrence_pairs' AS object_name, count(*)::bigint AS row_count FROM genre_cooccurrence_pairs
  UNION ALL SELECT 'genre_marginals', count(*) FROM genre_marginals
  UNION ALL SELECT 'genre_similarity_edges', count(*) FROM genre_similarity_edges
) t;

SELECT
  count(*) AS genres_with_edges,
  min(edge_count) AS min_edges,
  max(edge_count) AS max_edges,
  round(avg(edge_count), 2) AS avg_edges
FROM (
  SELECT genre_id, count(*) AS edge_count
  FROM genre_similarity_edges
  GROUP BY genre_id
) t;

SELECT g.name AS genre, g_neighbor.name AS neighbor, round(e.weight::numeric, 4) AS pmi
FROM genre_similarity_edges e
JOIN genres g ON g.id = e.genre_id
JOIN genres g_neighbor ON g_neighbor.id = e.neighbor_id
WHERE g.normalized_key IN ('rock', 'hip hop', 'electronic')
ORDER BY g.name, e.weight DESC
LIMIT 20;

SELECT ga.name AS genre_a, gb.name AS genre_b, p.pair_count, round(v.pmi::numeric, 4) AS pmi
FROM genre_cooccurrence_pairs p
JOIN genre_similarity_pmi v ON v.genre_a = p.genre_a AND v.genre_b = p.genre_b
JOIN genres ga ON ga.id = p.genre_a
JOIN genres gb ON gb.id = p.genre_b
ORDER BY p.pair_count DESC
LIMIT 10;

-- ############################################################################
-- PHASE 3: DAG TAXONOMY — Counts, consistency checks, sample paths
-- ############################################################################

SELECT '--- Phase 3: DAG taxonomy ---' AS section;

SELECT object_name, row_count
FROM (
  SELECT 'genre_taxonomy_roots' AS object_name, count(*)::bigint AS row_count FROM genre_taxonomy_roots
  UNION ALL SELECT 'genre_parent', count(*) FROM genre_parent
  UNION ALL SELECT 'genre_paths', count(*) FROM genre_paths
  UNION ALL SELECT 'genre_taxonomy_exclude (drop list)', count(*) FROM genre_taxonomy_exclude
) t;

-- Roots have path_slug = slug, depth 0
SELECT 'roots_with_paths' AS check_name, count(*)::bigint AS row_count
FROM genre_taxonomy_roots r
JOIN genre_paths p ON p.genre_id = r.genre_id AND p.depth = 0
JOIN genres g ON g.id = r.genre_id AND g.slug = p.path_slug;

-- Every genre in genre_parent has at least one path (expect 0 orphans)
SELECT 'orphan_children_no_path' AS check_name, count(*)::bigint AS row_count
FROM genre_parent gp
WHERE gp.child_id NOT IN (SELECT genre_id FROM genre_paths);

SELECT 'cluster_keys_count' AS check_name, count(*)::bigint AS row_count FROM genre_cluster_keys;

-- Sample paths with human-readable chain (genre names)
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

-- Fixed sample: one path under "rock" (depth 2–4) with full chain
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

-- ----- Done -----
SELECT 'genre_validation completed' AS status;
