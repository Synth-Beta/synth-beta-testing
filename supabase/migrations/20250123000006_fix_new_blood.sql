-- ============================================
-- FIX: New Blood Function
-- Removes invalid founding_date comparison (founding_date is TEXT, not timestamp)
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_new_blood(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_early_career_count INTEGER;
BEGIN
  -- Count events by artists with no external IDs
  -- Early career: artists with no external identifiers (likely emerging/independent)
  SELECT COUNT(DISTINCT r.event_id)
  INTO v_early_career_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  INNER JOIN public.artists a ON a.id = e.artist_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND r.is_draft = false
    AND (
      a.external_identifiers IS NULL 
      OR a.external_identifiers = '[]'::jsonb
      OR jsonb_array_length(COALESCE(a.external_identifiers, '[]'::jsonb)) = 0
    );

  PERFORM public.update_achievement_progress(
    p_user_id,
    'new_blood',
    COALESCE(v_early_career_count, 0),
    '{}'::jsonb
  );
END;
$$;





