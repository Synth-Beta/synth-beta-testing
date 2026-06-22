-- =============================================================================
-- GENRE SIMILARITY GRAPH (Personalization Layer)
-- Co-occurrence graph: pairs from artists_genres, PMI normalization, pruned edges.
-- Run after genres_schema.sql and backfill. Source: artists_genres only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pair counts: (genre_a, genre_b) with genre_a < genre_b, count of artists
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS genre_cooccurrence_pairs AS
SELECT
  ag1.genre_id AS genre_a,
  ag2.genre_id AS genre_b,
  count(*)::bigint AS pair_count
FROM artists_genres ag1
JOIN artists_genres ag2
  ON ag2.artist_id = ag1.artist_id
  AND ag1.genre_id < ag2.genre_id
GROUP BY ag1.genre_id, ag2.genre_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_pk
  ON genre_cooccurrence_pairs (genre_a, genre_b);
CREATE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_a ON genre_cooccurrence_pairs (genre_a);
CREATE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_b ON genre_cooccurrence_pairs (genre_b);

-- -----------------------------------------------------------------------------
-- 2. Genre marginals: artist count per genre
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS genre_marginals AS
SELECT
  genre_id,
  count(*)::bigint AS artist_count
FROM artists_genres
GROUP BY genre_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_genre_marginals_pk ON genre_marginals (genre_id);

-- -----------------------------------------------------------------------------
-- 3. Normalized edge weights (PMI)
-- PMI(a,b) = ln( P(a,b) / (P(a)*P(b)) ) = ln( pair_count * N / (count_a * count_b) )
-- N = total distinct artists with at least one genre
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW genre_similarity_pmi AS
WITH
total_artists AS (
  SELECT count(DISTINCT artist_id)::double precision AS n FROM artists_genres
),
pairs_with_marginals AS (
  SELECT
    p.genre_a,
    p.genre_b,
    p.pair_count,
    ma.artist_count AS count_a,
    mb.artist_count AS count_b,
    t.n AS total
  FROM genre_cooccurrence_pairs p
  JOIN genre_marginals ma ON ma.genre_id = p.genre_a
  JOIN genre_marginals mb ON mb.genre_id = p.genre_b
  CROSS JOIN total_artists t
  WHERE t.n > 0 AND ma.artist_count > 0 AND mb.artist_count > 0
)
SELECT
  genre_a,
  genre_b,
  pair_count,
  ln(greatest(1.0, (pair_count::double precision * total) / (count_a * count_b))) AS pmi
FROM pairs_with_marginals;

-- -----------------------------------------------------------------------------
-- 4. Pruned graph table: one row per (genre_id, neighbor_id, weight)
-- Populated by refresh script; top K per genre (e.g. 25)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genre_similarity_edges (
  genre_id uuid NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  neighbor_id uuid NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  weight double precision NOT NULL,
  PRIMARY KEY (genre_id, neighbor_id),
  CONSTRAINT genre_similarity_edges_no_self CHECK (genre_id <> neighbor_id)
);

CREATE INDEX IF NOT EXISTS idx_genre_similarity_edges_genre ON genre_similarity_edges (genre_id);
CREATE INDEX IF NOT EXISTS idx_genre_similarity_edges_neighbor ON genre_similarity_edges (neighbor_id);
