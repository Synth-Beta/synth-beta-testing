-- ============================================================
-- UPDATE DATABASE FUNCTIONS TO USE JAMBASE IDs
-- Replace UUID-based functions with JamBase ID-based versions
-- ============================================================

-- ============================================================
-- 1. Update get_artist_events to use JamBase artist_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_artist_events(artist_jambase_id TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    venue_name TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    venue_city TEXT,
    venue_state TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id as event_id,
        e.title as event_title,
        e.venue_name,
        e.event_date,
        e.venue_city,
        e.venue_state
    FROM public.events e
    WHERE e.artist_id = artist_jambase_id
      AND e.artist_id IS NOT NULL
    ORDER BY e.event_date DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Keep old UUID function for backward compatibility but mark as deprecated
COMMENT ON FUNCTION public.get_artist_events(UUID, INTEGER) IS 'DEPRECATED: Use get_artist_events(TEXT, INTEGER) with JamBase ID instead';

-- ============================================================
-- 2. Update get_venue_events to use JamBase venue_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_venue_events(venue_jambase_id TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    artist_name TEXT,
    event_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id as event_id,
        e.title as event_title,
        e.artist_name,
        e.event_date
    FROM public.events e
    WHERE e.venue_id = venue_jambase_id
      AND e.venue_id IS NOT NULL
    ORDER BY e.event_date DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Keep old UUID function for backward compatibility but mark as deprecated
COMMENT ON FUNCTION public.get_venue_events(UUID, INTEGER) IS 'DEPRECATED: Use get_venue_events(TEXT, INTEGER) with JamBase ID instead';

-- ============================================================
-- 3. Update get_venue_stats to use JamBase venue_id
-- ============================================================
-- Note: This function may need to match venues by JamBase ID
-- If the reviews table uses venue_id (UUID), we need to join through events
CREATE OR REPLACE FUNCTION public.get_venue_stats(venue_jambase_id TEXT)
RETURNS TABLE (
    total_reviews INTEGER,
    average_venue_rating NUMERIC,
    average_artist_rating NUMERIC,
    average_overall_rating NUMERIC,
    rating_distribution JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_reviews,
        COALESCE(AVG(r.venue_rating_decimal), 0)::NUMERIC as average_venue_rating,
        COALESCE(AVG(r.artist_rating_decimal), 0)::NUMERIC as average_artist_rating,
        COALESCE(AVG(r.rating), 0)::NUMERIC as average_overall_rating,
        jsonb_build_object(
            '1_star', COUNT(*) FILTER (WHERE r.rating = 1)::INTEGER,
            '2_star', COUNT(*) FILTER (WHERE r.rating = 2)::INTEGER,
            '3_star', COUNT(*) FILTER (WHERE r.rating = 3)::INTEGER,
            '4_star', COUNT(*) FILTER (WHERE r.rating = 4)::INTEGER,
            '5_star', COUNT(*) FILTER (WHERE r.rating = 5)::INTEGER
        ) as rating_distribution
    FROM public.reviews r
    JOIN public.events e ON r.event_id = e.id
    WHERE e.venue_id = venue_jambase_id
      AND e.venue_id IS NOT NULL
      AND r.is_draft = false;
END;
$$ LANGUAGE plpgsql;

-- Keep old UUID function for backward compatibility
COMMENT ON FUNCTION public.get_venue_stats(UUID) IS 'DEPRECATED: Use get_venue_stats(TEXT) with JamBase ID instead';

-- ============================================================
-- 4. Update get_popular_venue_tags to use JamBase venue_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_popular_venue_tags(venue_jambase_id TEXT DEFAULT NULL)
RETURNS TABLE (
    tag TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tag,
        COUNT(*)::BIGINT as count
    FROM public.review_tags t
    JOIN public.reviews r ON t.review_id = r.id
    JOIN public.events e ON r.event_id = e.id
    WHERE (venue_jambase_id IS NULL OR (e.venue_id = venue_jambase_id AND e.venue_id IS NOT NULL))
      AND r.is_draft = false
    GROUP BY t.tag
    ORDER BY count DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Keep old UUID function for backward compatibility
COMMENT ON FUNCTION public.get_popular_venue_tags(UUID) IS 'DEPRECATED: Use get_popular_venue_tags(TEXT) with JamBase ID instead';

-- ============================================================
-- 5. Update get_artist_stats to use JamBase artist_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_artist_stats(artist_jambase_id TEXT)
RETURNS TABLE (
    total_reviews INTEGER,
    average_rating NUMERIC,
    rating_distribution JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_reviews,
        COALESCE(AVG(r.artist_rating_decimal), 0)::NUMERIC as average_rating,
        jsonb_build_object(
            '1_star', COUNT(*) FILTER (WHERE r.rating = 1)::INTEGER,
            '2_star', COUNT(*) FILTER (WHERE r.rating = 2)::INTEGER,
            '3_star', COUNT(*) FILTER (WHERE r.rating = 3)::INTEGER,
            '4_star', COUNT(*) FILTER (WHERE r.rating = 4)::INTEGER,
            '5_star', COUNT(*) FILTER (WHERE r.rating = 5)::INTEGER
        ) as rating_distribution
    FROM public.reviews r
    JOIN public.events e ON r.event_id = e.id
    WHERE e.artist_id = artist_jambase_id
      AND e.artist_id IS NOT NULL
      AND r.is_draft = false;
END;
$$ LANGUAGE plpgsql;

-- Keep old UUID function for backward compatibility
COMMENT ON FUNCTION public.get_artist_stats(UUID) IS 'DEPRECATED: Use get_artist_stats(TEXT) with JamBase ID instead';

-- ============================================================
-- 6. GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_artist_events(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_events(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_venue_tags(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_stats(TEXT) TO authenticated;















