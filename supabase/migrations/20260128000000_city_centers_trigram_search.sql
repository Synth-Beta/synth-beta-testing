-- Add trigram index and RPC for fast fuzzy city search (discover location filter)
-- Uses pg_trgm for similarity-based search on normalized_name and aliases

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on normalized_name for fast % and similarity() queries
CREATE INDEX IF NOT EXISTS idx_city_centers_normalized_name_trgm
  ON public.city_centers
  USING gin (normalized_name gin_trgm_ops);

COMMENT ON INDEX idx_city_centers_normalized_name_trgm IS
  'GIN trigram index for fast fuzzy search on city names (discover location filter)';

-- RPC: search city_centers by trigram similarity on name and aliases
CREATE OR REPLACE FUNCTION public.search_city_centers(
  query text,
  max_results int DEFAULT 20
)
RETURNS SETOF public.city_centers
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT c.*
  FROM public.city_centers c
  WHERE c.normalized_name % query
     OR EXISTS (
       SELECT 1 FROM unnest(c.aliases) a
       WHERE a % query
     )
  ORDER BY
    greatest(
      similarity(c.normalized_name, query),
      (SELECT coalesce(max(similarity(a, query)), 0) FROM unnest(c.aliases) a)
    ) DESC NULLS LAST,
    c.population DESC NULLS LAST
  LIMIT max_results;
$$;

COMMENT ON FUNCTION public.search_city_centers(text, int) IS
  'Fuzzy search city_centers by name/aliases using trigram similarity for discover location filter';

COMMIT;
