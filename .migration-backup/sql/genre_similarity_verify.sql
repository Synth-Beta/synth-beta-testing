-- =============================================================================
-- GENRE SIMILARITY VERIFY — Sanity-check after refresh
-- =============================================================================

-- Row counts
SELECT 'genre_cooccurrence_pairs' AS object_name, count(*) AS row_count FROM genre_cooccurrence_pairs
UNION ALL
SELECT 'genre_marginals', count(*) FROM genre_marginals
UNION ALL
SELECT 'genre_similarity_edges', count(*) FROM genre_similarity_edges;

-- Edges per genre (min, max, avg)
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

-- Sample: top 5 neighbors for a few genres (by name)
SELECT g.name AS genre, g_neighbor.name AS neighbor, round(e.weight::numeric, 4) AS pmi
FROM genre_similarity_edges e
JOIN genres g ON g.id = e.genre_id
JOIN genres g_neighbor ON g_neighbor.id = e.neighbor_id
WHERE g.normalized_key IN ('rock', 'hip hop', 'electronic')
ORDER BY g.name, e.weight DESC
LIMIT 20;

-- Spot-check PMI: top pairs by co-occurrence, with genre names
SELECT
  ga.name AS genre_a,
  gb.name AS genre_b,
  p.pair_count,
  round(v.pmi::numeric, 4) AS pmi
FROM genre_cooccurrence_pairs p
JOIN genre_similarity_pmi v ON v.genre_a = p.genre_a AND v.genre_b = p.genre_b
JOIN genres ga ON ga.id = p.genre_a
JOIN genres gb ON gb.id = p.genre_b
ORDER BY p.pair_count DESC
LIMIT 10;
