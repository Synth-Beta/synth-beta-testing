-- ============================================
-- TRIGRAM SEARCH FOR BUCKET LIST
-- ============================================
-- Uses PostgreSQL trigram indexes for fast fuzzy search

-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index on bucket_list.entity_name for fast search
CREATE INDEX IF NOT EXISTS idx_bucket_list_entity_name_trgm 
  ON public.bucket_list 
  USING gin(entity_name gin_trgm_ops);

COMMENT ON INDEX idx_bucket_list_entity_name_trgm IS 
  'GIN trigram index for efficient ILIKE and similarity search on bucket list entity names';

-- ============================================
-- FUNCTION: SEARCH BUCKET LIST WITH TRIGRAM
-- ============================================
-- Uses trigram similarity for fast, fuzzy search of bucket list items

CREATE OR REPLACE FUNCTION public.search_bucket_list(
  p_user_id UUID,
  p_search_query TEXT,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  entity_type TEXT,
  entity_id UUID,
  entity_name TEXT,
  added_at TIMESTAMPTZ,
  metadata JSONB,
  similarity REAL,
  artist_id UUID,
  artist_name TEXT,
  artist_image_url TEXT,
  venue_id UUID,
  venue_name TEXT,
  venue_image_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH bucket_items AS (
    SELECT 
      bl.id,
      bl.user_id,
      bl.entity_type,
      bl.entity_id,
      bl.entity_name,
      bl.added_at,
      bl.metadata,
      -- Calculate similarity score using trigram
      CASE 
        WHEN LOWER(bl.entity_name) = LOWER(p_search_query) THEN 1.0
        WHEN LOWER(bl.entity_name) LIKE LOWER(p_search_query) || '%' THEN 0.9
        WHEN LOWER(bl.entity_name) LIKE '%' || LOWER(p_search_query) || '%' THEN 0.8
        ELSE GREATEST(
          similarity(LOWER(bl.entity_name), LOWER(p_search_query)),
          word_similarity(LOWER(p_search_query), LOWER(bl.entity_name))
        )
      END as similarity
    FROM public.bucket_list bl
    WHERE bl.user_id = p_user_id
      AND (
        -- Use ILIKE for initial filtering (uses trigram index efficiently)
        LOWER(bl.entity_name) ILIKE '%' || LOWER(p_search_query) || '%'
        -- OR use similarity for fuzzy matching
        OR similarity(LOWER(bl.entity_name), LOWER(p_search_query)) > 0.2
        OR word_similarity(LOWER(p_search_query), LOWER(bl.entity_name)) > 0.2
      )
  ),
  -- Enrich with artist/venue details
  enriched_items AS (
    SELECT 
      bi.*,
      CASE 
        WHEN bi.entity_type = 'artist' THEN a.id
        ELSE NULL
      END as artist_id,
      CASE 
        WHEN bi.entity_type = 'artist' THEN a.name
        ELSE NULL
      END as artist_name,
      CASE 
        WHEN bi.entity_type = 'artist' THEN a.image_url
        ELSE NULL
      END as artist_image_url,
      CASE 
        WHEN bi.entity_type = 'venue' THEN v.id
        ELSE NULL
      END as venue_id,
      CASE 
        WHEN bi.entity_type = 'venue' THEN v.name
        ELSE NULL
      END as venue_name,
      CASE 
        WHEN bi.entity_type = 'venue' THEN v.image_url
        ELSE NULL
      END as venue_image_url
    FROM bucket_items bi
    LEFT JOIN public.artists a ON bi.entity_type = 'artist' AND a.id = bi.entity_id
    LEFT JOIN public.venues v ON bi.entity_type = 'venue' AND v.id = bi.entity_id
  )
  SELECT 
    ei.id,
    ei.user_id,
    ei.entity_type,
    ei.entity_id,
    ei.entity_name,
    ei.added_at,
    ei.metadata,
    ei.similarity,
    ei.artist_id,
    ei.artist_name,
    ei.artist_image_url,
    ei.venue_id,
    ei.venue_name,
    ei.venue_image_url
  FROM enriched_items ei
  WHERE ei.similarity >= 0.2  -- Minimum similarity threshold
  ORDER BY 
    -- Order by: exact match, prefix match, contains match, then similarity
    CASE 
      WHEN ei.similarity = 1.0 THEN 1
      WHEN ei.similarity >= 0.9 THEN 2
      WHEN ei.similarity >= 0.8 THEN 3
      ELSE 4
    END,
    ei.similarity DESC,
    ei.entity_name ASC
  LIMIT p_limit;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.search_bucket_list(UUID, TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.search_bucket_list IS 
  'Searches bucket list items using PostgreSQL trigram indexes for fast fuzzy matching. Returns results sorted by relevance.';

