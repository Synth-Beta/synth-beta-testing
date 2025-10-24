-- Fix event management functions to include promotion fields
-- This ensures that events loaded in MyEventsManagementPanel include promotion status

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS public.get_user_created_events(UUID);
DROP FUNCTION IF EXISTS public.get_claimed_events(UUID);

-- Update get_user_created_events to include promotion fields
CREATE OR REPLACE FUNCTION public.get_user_created_events(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMPTZ,
  event_status TEXT,
  created_at TIMESTAMPTZ,
  media_urls TEXT[],
  poster_image_url TEXT,
  is_promoted BOOLEAN,
  promotion_tier TEXT,
  active_promotion_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id,
    je.title,
    je.artist_name,
    je.venue_name,
    je.event_date,
    je.event_status,
    je.created_at,
    je.media_urls,
    je.poster_image_url,
    COALESCE(je.is_promoted, false) as is_promoted,
    je.promotion_tier,
    je.active_promotion_id
  FROM public.jambase_events je
  WHERE je.created_by_user_id = COALESCE(p_user_id, auth.uid())
  ORDER BY je.event_date DESC;
END;
$$;

-- Update get_claimed_events to include promotion fields
CREATE OR REPLACE FUNCTION public.get_claimed_events(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMPTZ,
  event_status TEXT,
  created_at TIMESTAMPTZ,
  media_urls TEXT[],
  poster_image_url TEXT,
  is_promoted BOOLEAN,
  promotion_tier TEXT,
  active_promotion_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id,
    je.title,
    je.artist_name,
    je.venue_name,
    je.event_date,
    je.event_status,
    je.created_at,
    je.media_urls,
    je.poster_image_url,
    COALESCE(je.is_promoted, false) as is_promoted,
    je.promotion_tier,
    je.active_promotion_id
  FROM public.jambase_events je
  WHERE je.claimed_by_creator_id = COALESCE(p_user_id, auth.uid())
  ORDER BY je.event_date DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_user_created_events(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_claimed_events(UUID) TO authenticated;
