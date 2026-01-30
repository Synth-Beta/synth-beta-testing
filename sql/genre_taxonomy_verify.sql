-- =============================================================================
-- DAG TAXONOMY: Sanity-check after build
-- =============================================================================

-- Root count
SELECT 'genre_taxonomy_roots' AS object_name, count(*) AS row_count FROM genre_taxonomy_roots
UNION ALL
SELECT 'genre_parent', count(*) FROM genre_parent
UNION ALL
SELECT 'genre_paths', count(*) FROM genre_paths;

-- Sample roots with names
SELECT g.name, g.slug, g.normalized_key
FROM genre_taxonomy_roots r
JOIN genres g ON g.id = r.genre_id
ORDER BY g.name
LIMIT 25;

-- Sample paths (depth 1 and 2)
SELECT g.name AS genre_name, p.path_slug, p.depth
FROM genre_paths p
JOIN genres g ON g.id = p.genre_id
WHERE p.depth BETWEEN 1 AND 2
ORDER BY p.path_slug, p.depth
LIMIT 20;

-- "Under rock" count (all depths vs depth-capped for personalization)
SELECT count(*) AS genres_under_rock_all_depths FROM get_genres_under_umbrella('rock', 99);
SELECT count(*) AS genres_under_rock_depth_cap_5 FROM get_genres_under_umbrella('rock', 5);

-- Depth distribution
SELECT depth, count(*) AS path_count
FROM genre_paths
GROUP BY depth
ORDER BY depth;

-- -----------------------------------------------------------------------------
-- Clustering & personalization (requires genre_taxonomy_helpers.sql)
-- -----------------------------------------------------------------------------
-- Cluster keys (one per genre, depth 0-2): use for clustering artists/events
SELECT umbrella_slug, cluster_path_slug, count(*) AS genre_count
FROM genre_cluster_keys
GROUP BY umbrella_slug, cluster_path_slug
ORDER BY umbrella_slug, cluster_path_slug
LIMIT 30;

-- Example: events under Rock with depth cap 5 (personalization rollup)
-- SELECT e.* FROM events e
-- JOIN events_genres eg ON eg.event_id = e.id
-- WHERE eg.genre_id IN (SELECT * FROM get_genres_under_umbrella('rock', 5));

-- Example: cluster artists by umbrella (clustering)
-- SELECT a.id, ck.umbrella_slug FROM artists a
-- JOIN artists_genres ag ON ag.artist_id = a.id
-- JOIN genre_cluster_keys ck ON ck.genre_id = ag.genre_id
-- GROUP BY a.id, ck.umbrella_slug;
