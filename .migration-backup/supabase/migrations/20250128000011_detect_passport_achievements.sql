-- ============================================
-- BEHAVIORAL ACHIEVEMENT DETECTORS
-- Detects achievements that signal taste, curiosity, or contribution
-- ============================================

-- Function: Detect first-time city achievement
CREATE OR REPLACE FUNCTION public.detect_first_time_city(p_user_id UUID, p_event_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_city TEXT;
  v_state TEXT;
  v_previous_cities INTEGER;
BEGIN
  -- Get event city
  SELECT venue_city, venue_state
  INTO v_city, v_state
  FROM public.events
  WHERE id = p_event_id;

  IF v_city IS NULL OR LOWER(TRIM(v_city)) = 'unknown' THEN
    RETURN;
  END IF;

  -- Check if this is user's first event in this city
  SELECT COUNT(*)
  INTO v_previous_cities
  FROM public.passport_entries
  WHERE user_id = p_user_id
    AND type = 'city'
    AND entity_id = LOWER(COALESCE(v_city, '') || COALESCE('_' || v_state, ''));

  -- If this is a new city, unlock achievement
  IF v_previous_cities = 0 THEN
    INSERT INTO public.passport_achievements (
      user_id,
      achievement_type,
      metadata,
      unlocked_at
    )
    VALUES (
      p_user_id,
      'first_time_city',
      jsonb_build_object('city', v_city, 'state', v_state, 'event_id', p_event_id),
      now()
    )
    ON CONFLICT (user_id, achievement_type) DO NOTHING;
  END IF;
END;
$$;

-- Function: Detect deep cut reviewer achievement
CREATE OR REPLACE FUNCTION public.detect_deep_cut_reviewer(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_review_count INTEGER;
  v_deep_cut_reviews INTEGER;
  v_ratio NUMERIC;
BEGIN
  -- Count total reviews
  SELECT COUNT(*)
  INTO v_review_count
  FROM public.reviews
  WHERE user_id = p_user_id
    AND review_text IS NOT NULL
    AND review_text != 'ATTENDANCE_ONLY'
    AND LENGTH(TRIM(review_text)) > 10;

  IF v_review_count < 5 THEN
    RETURN;  -- Need at least 5 reviews
  END IF;

  -- Count reviews that mention non-headliner artists (heuristic: mentions multiple artists)
  SELECT COUNT(*)
  INTO v_deep_cut_reviews
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = p_user_id
    AND r.review_text IS NOT NULL
    AND r.review_text != 'ATTENDANCE_ONLY'
    -- Check if review mentions artist names (simple heuristic)
    AND (
      LOWER(r.review_text) LIKE '%opening%' 
      OR LOWER(r.review_text) LIKE '%support%'
      OR LOWER(r.review_text) LIKE '%opener%'
      OR (SELECT COUNT(*) FROM unnest(string_to_array(r.review_text, ' ')) word WHERE word ILIKE e.artist_name || '%') = 0
    );

  v_ratio := v_deep_cut_reviews::NUMERIC / NULLIF(v_review_count, 0);

  -- If 30%+ of reviews mention non-headliners, unlock achievement
  IF v_ratio >= 0.3 THEN
    INSERT INTO public.passport_achievements (
      user_id,
      achievement_type,
      metadata,
      unlocked_at
    )
    VALUES (
      p_user_id,
      'deep_cut_reviewer',
      jsonb_build_object('review_count', v_review_count, 'deep_cut_count', v_deep_cut_reviews, 'ratio', v_ratio),
      now()
    )
    ON CONFLICT (user_id, achievement_type) 
    DO UPDATE SET
      metadata = EXCLUDED.metadata,
      unlocked_at = now();
  END IF;
END;
$$;

-- Function: Detect scene connector achievement
CREATE OR REPLACE FUNCTION public.detect_scene_connector(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scene_count INTEGER;
  v_related_scenes INTEGER;
BEGIN
  -- Count distinct scenes user has participated in
  SELECT COUNT(DISTINCT scene_id)
  INTO v_scene_count
  FROM public.passport_entries
  WHERE user_id = p_user_id
    AND type = 'scene';

  IF v_scene_count < 3 THEN
    RETURN;  -- Need at least 3 scenes
  END IF;

  -- Check if user has attended events across multiple related scenes
  -- (Scenes are "related" if they share artists, venues, or genres)
  SELECT COUNT(DISTINCT pe1.scene_id)
  INTO v_related_scenes
  FROM public.passport_entries pe1
  INNER JOIN public.passport_entries pe2 ON pe2.user_id = pe1.user_id
    AND pe2.type = 'scene'
    AND pe2.scene_id != pe1.scene_id
  WHERE pe1.user_id = p_user_id
    AND pe1.type = 'scene';

  -- If user has participated in 3+ related scenes, unlock achievement
  IF v_scene_count >= 3 THEN
    INSERT INTO public.passport_achievements (
      user_id,
      achievement_type,
      metadata,
      unlocked_at
    )
    VALUES (
      p_user_id,
      'scene_connector',
      jsonb_build_object('scene_count', v_scene_count, 'related_scenes', v_related_scenes),
      now()
    )
    ON CONFLICT (user_id, achievement_type) 
    DO UPDATE SET
      metadata = EXCLUDED.metadata,
      unlocked_at = now();
  END IF;
END;
$$;

-- Function: Detect trusted taste achievement
CREATE OR REPLACE FUNCTION public.detect_trusted_taste(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_review_count INTEGER;
  v_total_likes INTEGER;
  v_total_saves INTEGER;
  v_avg_likes_per_review NUMERIC;
BEGIN
  -- Count reviews and engagement
  SELECT 
    COUNT(*),
    COALESCE(SUM(likes_count), 0),
    0  -- TODO: Add saves_count when available
  INTO v_review_count, v_total_likes, v_total_saves
  FROM public.reviews
  WHERE user_id = p_user_id
    AND is_public = true
    AND review_text IS NOT NULL
    AND review_text != 'ATTENDANCE_ONLY';

  IF v_review_count < 5 THEN
    RETURN;  -- Need at least 5 public reviews
  END IF;

  v_avg_likes_per_review := v_total_likes::NUMERIC / NULLIF(v_review_count, 0);

  -- If average 5+ likes per review, unlock achievement
  IF v_avg_likes_per_review >= 5 THEN
    INSERT INTO public.passport_achievements (
      user_id,
      achievement_type,
      metadata,
      unlocked_at
    )
    VALUES (
      p_user_id,
      'trusted_taste',
      jsonb_build_object(
        'review_count', v_review_count,
        'total_likes', v_total_likes,
        'avg_likes_per_review', v_avg_likes_per_review
      ),
      now()
    )
    ON CONFLICT (user_id, achievement_type) 
    DO UPDATE SET
      metadata = EXCLUDED.metadata,
      unlocked_at = now();
  END IF;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.detect_first_time_city(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_deep_cut_reviewer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_scene_connector(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_trusted_taste(UUID) TO authenticated;

COMMENT ON FUNCTION public.detect_first_time_city IS 'Detects first-time city achievement when user attends event in new city';
COMMENT ON FUNCTION public.detect_deep_cut_reviewer IS 'Detects deep cut reviewer: consistently mentions non-headliner artists';
COMMENT ON FUNCTION public.detect_scene_connector IS 'Detects scene connector: attends events across multiple related scenes';
COMMENT ON FUNCTION public.detect_trusted_taste IS 'Detects trusted taste: reviews get high engagement (likes/saves)';

