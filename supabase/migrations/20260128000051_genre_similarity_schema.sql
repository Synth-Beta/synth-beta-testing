-- =============================================================================
-- Genre similarity: co-occurrence MVs, PMI view, edges table
-- Depends on: 20260128000050 (genres, artists_genres)
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.genre_cooccurrence_pairs AS
SELECT
  ag1.genre_id AS genre_a,
  ag2.genre_id AS genre_b,
  count(*)::bigint AS pair_count
FROM public.artists_genres ag1
JOIN public.artists_genres ag2
  ON ag2.artist_id = ag1.artist_id
  AND ag1.genre_id < ag2.genre_id
GROUP BY ag1.genre_id, ag2.genre_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_pk
  ON public.genre_cooccurrence_pairs (genre_a, genre_b);
CREATE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_a ON public.genre_cooccurrence_pairs (genre_a);
CREATE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_b ON public.genre_cooccurrence_pairs (genre_b);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.genre_marginals AS
SELECT
  genre_id,
  count(*)::bigint AS artist_count
FROM public.artists_genres
GROUP BY genre_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_genre_marginals_pk ON public.genre_marginals (genre_id);

CREATE OR REPLACE VIEW public.genre_similarity_pmi AS
WITH
total_artists AS (
  SELECT count(DISTINCT artist_id)::double precision AS n FROM public.artists_genres
),
pairs_with_marginals AS (
  SELECT
    p.genre_a,
    p.genre_b,
    p.pair_count,
    ma.artist_count AS count_a,
    mb.artist_count AS count_b,
    t.n AS total
  FROM public.genre_cooccurrence_pairs p
  JOIN public.genre_marginals ma ON ma.genre_id = p.genre_a
  JOIN public.genre_marginals mb ON mb.genre_id = p.genre_b
  CROSS JOIN total_artists t
  WHERE t.n > 0 AND ma.artist_count > 0 AND mb.artist_count > 0
)
SELECT
  genre_a,
  genre_b,
  pair_count,
  ln(greatest(1.0, (pair_count::double precision * total) / (count_a * count_b))) AS pmi
FROM pairs_with_marginals;

CREATE TABLE IF NOT EXISTS public.genre_similarity_edges (
  genre_id uuid NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  neighbor_id uuid NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  weight double precision NOT NULL,
  PRIMARY KEY (genre_id, neighbor_id),
  CONSTRAINT genre_similarity_edges_no_self CHECK (genre_id <> neighbor_id)
);

CREATE INDEX IF NOT EXISTS idx_genre_similarity_edges_genre ON public.genre_similarity_edges (genre_id);
CREATE INDEX IF NOT EXISTS idx_genre_similarity_edges_neighbor ON public.genre_similarity_edges (neighbor_id);
