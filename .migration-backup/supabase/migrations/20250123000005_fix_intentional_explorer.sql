-- ============================================
-- FIX: Intentional Explorer Function
-- Uses venues as a proxy for scenes (different venues = different scenes)
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_intentional_explorer(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_scenes INTEGER;
  v_top_genre TEXT;
BEGIN
  -- Use distinct venues per genre as a proxy for "scenes"
  -- Different venues in the same genre represent different scenes
  WITH user_events_with_genres AS (
    SELECT DISTINCT e.venue_id, UNNEST(e.genres) as genre
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
      AND r.is_draft = false
      AND e.genres IS NOT NULL
      AND e.venue_id IS NOT NULL
  ),
  genre_venue_counts AS (
    SELECT genre, COUNT(DISTINCT venue_id) as venue_count
    FROM user_events_with_genres
    GROUP BY genre
  )
  SELECT venue_count, genre
  INTO v_max_scenes, v_top_genre
  FROM genre_venue_counts
  ORDER BY venue_count DESC
  LIMIT 1;

  PERFORM public.update_achievement_progress(
    p_user_id,
    'intentional_explorer',
    COALESCE(v_max_scenes, 0),
    jsonb_build_object('top_genre', v_top_genre)
  );
END;
$$;

