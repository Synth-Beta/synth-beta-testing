-- =============================================================================
-- Taxonomy helpers: get_genres_under_umbrella, genre_cluster_keys view
-- Depends on: 20260128000050 (genres), 20260128000051 (genre_marginals), 20260128000052 (genre_paths, genre_taxonomy_exclude)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_genres_under_umbrella(p_slug text, p_max_depth int DEFAULT 5)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT p.genre_id
  FROM public.genre_paths p
  JOIN public.genres g ON g.id = p.genre_id
  WHERE (p.path_slug = p_slug OR p.path_slug LIKE p_slug || '.%')
    AND p.depth <= p_max_depth
    AND g.normalized_key NOT IN (SELECT normalized_key FROM public.genre_taxonomy_exclude);
$$;

CREATE OR REPLACE VIEW public.genre_cluster_keys AS
WITH best_path AS (
  SELECT DISTINCT ON (p.genre_id) p.genre_id, p.path_slug, p.depth
  FROM public.genre_paths p
  JOIN public.genre_marginals m ON m.genre_id = p.genre_id AND m.artist_count >= 5
  JOIN public.genres g ON g.id = p.genre_id
  WHERE g.normalized_key NOT IN (SELECT normalized_key FROM public.genre_taxonomy_exclude)
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
