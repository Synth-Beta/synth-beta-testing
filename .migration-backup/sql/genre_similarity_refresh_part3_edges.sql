-- =============================================================================
-- REFRESH PART 3: Pruned graph — top 25 edges per genre (both directions)
-- =============================================================================

SET statement_timeout = '600s';

TRUNCATE genre_similarity_edges;

INSERT INTO genre_similarity_edges (genre_id, neighbor_id, weight)
SELECT genre_id, neighbor_id, weight
FROM (
  SELECT
    genre_id,
    neighbor_id,
    weight,
    row_number() OVER (PARTITION BY genre_id ORDER BY weight DESC) AS rn
  FROM (
    SELECT genre_a AS genre_id, genre_b AS neighbor_id, pmi AS weight
    FROM genre_similarity_pmi
    UNION ALL
    SELECT genre_b AS genre_id, genre_a AS neighbor_id, pmi AS weight
    FROM genre_similarity_pmi
  ) both_dirs
) ranked
WHERE rn <= 25;
