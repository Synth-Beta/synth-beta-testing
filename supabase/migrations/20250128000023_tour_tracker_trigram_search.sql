-- ============================================
-- TRIGRAM SEARCH FOR TOUR TRACKER (ARTIST SEARCH)
-- ============================================
-- Adds server-side trigram search for artist search in tour tracker
-- This improves search performance for the discover feed

-- Ensure pg_trgm extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index on artists.name if it doesn't exist
-- Note: This may already exist from previous migrations, but we'll ensure it's there
CREATE INDEX IF NOT EXISTS idx_artists_name_trgm 
  ON public.artists 
  USING gin(name gin_trgm_ops);

-- ============================================
-- RPC FUNCTION: search_artists_trigram
-- ============================================
-- Fast server-side trigram search for artists
-- Used by tour tracker and other artist search components

CREATE OR REPLACE FUNCTION public.search_artists_trigram(
    p_search_query TEXT,
    p_limit INT DEFAULT 50
)
RETURNS TABLE(
    id UUID,
    name TEXT,
    identifier TEXT,
    image_url TEXT,
    genres TEXT[],
    band_or_musician TEXT,
    num_upcoming_events INT,
    match_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    search_pattern TEXT := LOWER(TRIM(p_search_query));
BEGIN
    -- Return empty if query is too short
    IF LENGTH(search_pattern) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH ranked_results AS (
        SELECT
            a.id,
            a.name,
            COALESCE(a.identifier, 'manual:' || a.id::TEXT) as identifier,
            a.image_url,
            a.genres,
            a.band_or_musician,
            COALESCE(a.num_upcoming_events, 0) as num_upcoming_events,
            -- Calculate composite search score
            CASE
                WHEN LOWER(a.name) = search_pattern THEN 100.0 -- Exact match
                WHEN LOWER(a.name) LIKE search_pattern || '%' THEN 90.0 -- Prefix match
                WHEN LOWER(a.name) LIKE '%' || search_pattern || '%' THEN 80.0 -- Contains match
                ELSE (similarity(a.name, p_search_query) * 70.0) -- Fuzzy match
            END AS score
        FROM
            public.artists a
        WHERE
            (
                LOWER(a.name) LIKE '%' || search_pattern || '%'
                OR similarity(a.name, p_search_query) > 0.3 -- Trigram similarity threshold
            )
    )
    SELECT
        rr.id,
        rr.name,
        rr.identifier,
        rr.image_url,
        rr.genres,
        rr.band_or_musician,
        rr.num_upcoming_events,
        rr.score
    FROM
        ranked_results rr
    ORDER BY
        rr.score DESC, rr.name ASC
    LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.search_artists_trigram(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_artists_trigram(TEXT, INT) TO anon;

-- Add comment
COMMENT ON FUNCTION public.search_artists_trigram IS 'Fast server-side trigram search for artists, used by tour tracker and artist search components. Returns ranked results with match scores.';

