-- =============================================================================
-- Replace onboarding_genre_categories: use genres table + add search_genres_trigram
-- Drops onboarding_genre_categories if it exists. Adds trigram search for genres.
-- Cities and artists already have trigram search (search_city_centers, search_artists_trigram).
-- =============================================================================

-- Ensure pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes on genres for fuzzy search
CREATE INDEX IF NOT EXISTS idx_genres_name_trgm
  ON public.genres
  USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_genres_normalized_key_trgm
  ON public.genres
  USING gin (normalized_key gin_trgm_ops);

COMMENT ON INDEX idx_genres_name_trgm IS
  'GIN trigram index for fuzzy genre search (onboarding, preferences)';

-- RPC: search genres by trigram similarity
CREATE OR REPLACE FUNCTION public.search_genres_trigram(
  p_search_query text,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  name text,
  normalized_key text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT g.id, g.name, g.normalized_key
  FROM public.genres g
  WHERE length(trim(lower(p_search_query))) >= 2
    AND (
      g.name % p_search_query
      OR g.normalized_key % p_search_query
      OR lower(g.name) LIKE '%' || lower(trim(p_search_query)) || '%'
    )
  ORDER BY
    greatest(similarity(g.name, p_search_query), similarity(g.normalized_key, p_search_query)) DESC NULLS LAST,
    g.name ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_genres_trigram(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_genres_trigram(text, int) TO anon;

COMMENT ON FUNCTION public.search_genres_trigram(text, int) IS
  'Fuzzy search genres by name/normalized_key using trigram similarity. Used for onboarding and adding genres.';
