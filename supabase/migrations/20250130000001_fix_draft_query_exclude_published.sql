-- Fix get_user_draft_reviews to exclude drafts when published review exists
-- This prevents drafts from showing in "Unreviewed" after review submission

CREATE OR REPLACE FUNCTION public.get_user_draft_reviews(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  draft_data JSONB,
  last_saved_at TIMESTAMP WITH TIME ZONE,
  event_title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.event_id,
    r.draft_data,
    r.last_saved_at,
    COALESCE(
      r.draft_data->>'eventTitle',
      e.title
    ) as event_title,
    COALESCE(
      r.draft_data->'selectedArtist'->>'name',
      e.artist_name
    ) as artist_name,
    COALESCE(
      r.draft_data->'selectedVenue'->>'name',
      e.venue_name
    ) as venue_name,
    -- Prefer eventDate from draft_data, fallback to event's event_date
    COALESCE(
      CASE 
        WHEN r.draft_data->>'eventDate' IS NOT NULL 
        THEN (r.draft_data->>'eventDate' || 'T20:00:00Z')::TIMESTAMP WITH TIME ZONE
        ELSE NULL
      END,
      e.event_date
    ) as event_date
  FROM public.reviews r
  LEFT JOIN public.events e ON r.event_id = e.id
  WHERE r.user_id = p_user_id 
    AND r.is_draft = true
    -- CRITICAL: Exclude drafts for events that already have published reviews
    -- This prevents drafts from showing in "Unreviewed" when review is already submitted
    AND NOT EXISTS (
      SELECT 1 
      FROM public.reviews r2 
      WHERE r2.user_id = r.user_id 
        AND r2.event_id = r.event_id 
        AND r2.is_draft = false
        AND r2.review_text IS NOT NULL
        AND r2.review_text != 'ATTENDANCE_ONLY'
    )
  ORDER BY r.last_saved_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_draft_reviews(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_user_draft_reviews(UUID) IS 'Returns user draft reviews, excluding events that already have published reviews';

