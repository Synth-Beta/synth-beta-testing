-- ============================================
-- ACHIEVEMENT PROGRESS FUNCTIONS
-- Functions to calculate and update achievement progress
-- ============================================

-- ============================================
-- HELPER FUNCTION: Update achievement progress
-- ============================================
CREATE OR REPLACE FUNCTION public.update_achievement_progress(
  p_user_id UUID,
  p_achievement_key TEXT,
  p_current_progress INTEGER,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_achievement_id UUID;
  v_bronze_goal INTEGER;
  v_silver_goal INTEGER;
  v_gold_goal INTEGER;
  v_highest_tier TEXT;
  v_bronze_achieved_at TIMESTAMPTZ;
  v_silver_achieved_at TIMESTAMPTZ;
  v_gold_achieved_at TIMESTAMPTZ;
BEGIN
  -- Get achievement ID and goals
  SELECT id, bronze_goal, silver_goal, gold_goal
  INTO v_achievement_id, v_bronze_goal, v_silver_goal, v_gold_goal
  FROM public.achievements
  WHERE achievement_key = p_achievement_key
    AND is_active = true;

  IF v_achievement_id IS NULL THEN
    RETURN;
  END IF;

  -- Determine highest tier achieved
  IF p_current_progress >= v_gold_goal THEN
    v_highest_tier := 'gold';
  ELSIF p_current_progress >= v_silver_goal THEN
    v_highest_tier := 'silver';
  ELSIF p_current_progress >= v_bronze_goal THEN
    v_highest_tier := 'bronze';
  ELSE
    v_highest_tier := NULL;
  END IF;

  -- Get existing progress to preserve tier timestamps
  SELECT bronze_achieved_at, silver_achieved_at, gold_achieved_at
  INTO v_bronze_achieved_at, v_silver_achieved_at, v_gold_achieved_at
  FROM public.user_achievement_progress
  WHERE user_id = p_user_id AND achievement_id = v_achievement_id;

  -- Set timestamps for newly achieved tiers
  IF v_highest_tier = 'gold' AND v_gold_achieved_at IS NULL THEN
    v_gold_achieved_at := now();
    IF v_silver_achieved_at IS NULL THEN
      v_silver_achieved_at := now();
    END IF;
    IF v_bronze_achieved_at IS NULL THEN
      v_bronze_achieved_at := now();
    END IF;
  ELSIF v_highest_tier = 'silver' AND v_silver_achieved_at IS NULL THEN
    v_silver_achieved_at := now();
    IF v_bronze_achieved_at IS NULL THEN
      v_bronze_achieved_at := now();
    END IF;
  ELSIF v_highest_tier = 'bronze' AND v_bronze_achieved_at IS NULL THEN
    v_bronze_achieved_at := now();
  END IF;

  -- Insert or update progress
  INSERT INTO public.user_achievement_progress (
    user_id,
    achievement_id,
    current_progress,
    highest_tier_achieved,
    bronze_achieved_at,
    silver_achieved_at,
    gold_achieved_at,
    progress_metadata,
    updated_at
  )
  VALUES (
    p_user_id,
    v_achievement_id,
    p_current_progress,
    v_highest_tier,
    v_bronze_achieved_at,
    v_silver_achieved_at,
    v_gold_achieved_at,
    p_metadata,
    now()
  )
  ON CONFLICT (user_id, achievement_id)
  DO UPDATE SET
    current_progress = EXCLUDED.current_progress,
    highest_tier_achieved = EXCLUDED.highest_tier_achieved,
    bronze_achieved_at = COALESCE(user_achievement_progress.bronze_achieved_at, EXCLUDED.bronze_achieved_at),
    silver_achieved_at = COALESCE(user_achievement_progress.silver_achieved_at, EXCLUDED.silver_achieved_at),
    gold_achieved_at = COALESCE(user_achievement_progress.gold_achieved_at, EXCLUDED.gold_achieved_at),
    progress_metadata = EXCLUDED.progress_metadata,
    updated_at = now();
END;
$$;

-- ============================================
-- ACHIEVEMENT 1: Genre Curator (3/5/8 genres)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_genre_curator(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genre_count INTEGER;
  v_genres TEXT[];
BEGIN
  -- Count distinct genres from attended events
  SELECT COUNT(DISTINCT genre), array_agg(DISTINCT genre)
  INTO v_genre_count, v_genres
  FROM (
    SELECT UNNEST(e.genres) as genre
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
      AND r.is_draft = false
      AND e.genres IS NOT NULL
  ) genre_list;

  PERFORM public.update_achievement_progress(
    p_user_id,
    'genre_curator',
    COALESCE(v_genre_count, 0),
    jsonb_build_object('genres', v_genres)
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 2: Genre Specialist (5/10/20 shows in one genre)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_genre_specialist(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_genre_count INTEGER;
  v_top_genre TEXT;
BEGIN
  -- Find the genre with most shows attended
  SELECT COUNT(*), genre
  INTO v_max_genre_count, v_top_genre
  FROM (
    SELECT e.id, UNNEST(e.genres) as genre
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
      AND r.is_draft = false
      AND e.genres IS NOT NULL
  ) genre_events
  GROUP BY genre
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  PERFORM public.update_achievement_progress(
    p_user_id,
    'genre_specialist',
    COALESCE(v_max_genre_count, 0),
    jsonb_build_object('top_genre', v_top_genre)
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 3: Bucket List Starter (1/3/6 bucket list events)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_bucket_list_starter(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket_list_count INTEGER;
BEGIN
  -- Count events where artist or venue is in user's bucket list
  SELECT COUNT(DISTINCT r.event_id)
  INTO v_bucket_list_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND r.is_draft = false
    AND (
      EXISTS (
        SELECT 1 FROM public.bucket_list bl
        WHERE bl.user_id = p_user_id
          AND bl.entity_type = 'artist'
          AND bl.entity_id = e.artist_id
      )
      OR EXISTS (
        SELECT 1 FROM public.bucket_list bl
        WHERE bl.user_id = p_user_id
          AND bl.entity_type = 'venue'
          AND bl.entity_id = e.venue_id
      )
    );

  PERFORM public.update_achievement_progress(
    p_user_id,
    'bucket_list_starter',
    COALESCE(v_bucket_list_count, 0),
    '{}'::jsonb
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 4: Intentional Explorer (3/5/7 scenes in one genre)
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

-- ============================================
-- ACHIEVEMENT 5: Set Break Scholar (2/5/10 detailed reviews)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_set_break_scholar(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_detailed_count INTEGER;
BEGIN
  -- Count reviews with set-level detail (setlist, custom_setlist, or detailed review_text)
  SELECT COUNT(*)
  INTO v_detailed_count
  FROM public.reviews r
  WHERE r.user_id = p_user_id
    AND r.is_draft = false
    AND (
      r.setlist IS NOT NULL
      OR (r.review_text IS NOT NULL AND length(r.review_text) > 100)
      OR r.artist_performance_feedback IS NOT NULL
      OR r.production_feedback IS NOT NULL
    );

  PERFORM public.update_achievement_progress(
    p_user_id,
    'set_break_scholar',
    COALESCE(v_detailed_count, 0),
    '{}'::jsonb
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 6: Album-to-Stage (1/3/6 studio-to-live connections)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_album_to_stage(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_connections_count INTEGER;
BEGIN
  -- This would require tracking user engagement with studio releases
  -- For now, return 0 as this needs additional infrastructure
  -- TODO: Implement when studio release tracking is available
  v_connections_count := 0;

  PERFORM public.update_achievement_progress(
    p_user_id,
    'album_to_stage',
    v_connections_count,
    '{}'::jsonb
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 7: Legacy Listener (2/3/4 decades)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_legacy_listener(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_decade_count INTEGER;
BEGIN
  -- Count distinct decades from event dates (simplified)
  -- Each event represents when user saw artist, decade based on event date
  SELECT COUNT(DISTINCT (EXTRACT(YEAR FROM e.event_date) / 10)::INTEGER * 10)
  INTO v_decade_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND r.is_draft = false;

  PERFORM public.update_achievement_progress(
    p_user_id,
    'legacy_listener',
    COALESCE(v_decade_count, 0),
    '{}'::jsonb
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 8: New Blood (2/5/10 early-career shows)
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

-- ============================================
-- ACHIEVEMENT 9: Full Spectrum (1/3/5 genres with both acoustic and high-energy)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_full_spectrum(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genre_count INTEGER;
BEGIN
  -- This requires energy classification which may not exist yet
  -- Simplified: Count genres with both intimate and intense events
  -- This is a placeholder - may need venue_type or event metadata
  v_genre_count := 0;

  -- TODO: Implement when energy classification is available
  PERFORM public.update_achievement_progress(
    p_user_id,
    'full_spectrum',
    v_genre_count,
    '{}'::jsonb
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 10: Return Engagement (2/3/5 tours/eras for same artist)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_return_engagement(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_tours INTEGER;
  v_artist_id UUID;
BEGIN
  -- Find artist with most distinct tours/eras
  SELECT COUNT(DISTINCT COALESCE(e.tour_name, (EXTRACT(YEAR FROM e.event_date) || ' Tour')::text)), e.artist_id
  INTO v_max_tours, v_artist_id
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND r.is_draft = false
    AND e.artist_id IS NOT NULL
  GROUP BY e.artist_id
  ORDER BY COUNT(DISTINCT COALESCE(e.tour_name, (EXTRACT(YEAR FROM e.event_date) || ' Tour')::text)) DESC
  LIMIT 1;

  PERFORM public.update_achievement_progress(
    p_user_id,
    'return_engagement',
    COALESCE(v_max_tours, 0),
    jsonb_build_object('artist_id', v_artist_id)
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 11: Festival Attendance (1/3/5 festivals)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_festival_attendance(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_festival_count INTEGER;
BEGIN
  -- Count distinct festivals (venues with 'festival' or 'fair' in name)
  SELECT COUNT(DISTINCT e.venue_id)
  INTO v_festival_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  INNER JOIN public.venues v ON v.id = e.venue_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND r.is_draft = false
    AND (
      LOWER(v.name) LIKE '%festival%'
      OR LOWER(v.name) LIKE '%fair%'
      OR LOWER(e.title) LIKE '%festival%'
    );

  PERFORM public.update_achievement_progress(
    p_user_id,
    'festival_attendance',
    COALESCE(v_festival_count, 0),
    '{}'::jsonb
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 12: Artist Devotee (3/5/10 times seeing same artist)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_artist_devotee(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_artist_count INTEGER;
  v_artist_id UUID;
BEGIN
  -- Find artist with most shows attended
  SELECT COUNT(*), e.artist_id
  INTO v_max_artist_count, v_artist_id
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND r.is_draft = false
    AND e.artist_id IS NOT NULL
  GROUP BY e.artist_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  PERFORM public.update_achievement_progress(
    p_user_id,
    'artist_devotee',
    COALESCE(v_max_artist_count, 0),
    jsonb_build_object('artist_id', v_artist_id)
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 13: Venue Regular (5/10/20 shows at same venue)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_venue_regular(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_venue_count INTEGER;
  v_venue_id UUID;
BEGIN
  -- Find venue with most shows attended
  SELECT COUNT(*), e.venue_id
  INTO v_max_venue_count, v_venue_id
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND r.is_draft = false
    AND e.venue_id IS NOT NULL
  GROUP BY e.venue_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  PERFORM public.update_achievement_progress(
    p_user_id,
    'venue_regular',
    COALESCE(v_max_venue_count, 0),
    jsonb_build_object('venue_id', v_venue_id)
  );
END;
$$;

-- ============================================
-- ACHIEVEMENT 14: Go with Friends! (2/5/10 shows with friends)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_go_with_friends(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_friend_shows_count INTEGER;
BEGIN
  -- Count events where friends also attended
  SELECT COUNT(DISTINCT r1.event_id)
  INTO v_friend_shows_count
  FROM public.reviews r1
  INNER JOIN public.reviews r2 ON r2.event_id = r1.event_id
    AND r2.user_id != r1.user_id
    AND (r2.was_there = true OR (r2.review_text IS NOT NULL AND r2.review_text != 'ATTENDANCE_ONLY'))
    AND r2.is_draft = false
  INNER JOIN public.user_relationships ur ON (
    (ur.user_id = r1.user_id AND ur.related_user_id = r2.user_id)
    OR (ur.user_id = r2.user_id AND ur.related_user_id = r1.user_id)
  )
  WHERE r1.user_id = p_user_id
    AND (r1.was_there = true OR (r1.review_text IS NOT NULL AND r1.review_text != 'ATTENDANCE_ONLY'))
    AND r1.is_draft = false
    AND ur.relationship_type = 'friend'
    AND ur.status = 'accepted';

  PERFORM public.update_achievement_progress(
    p_user_id,
    'go_with_friends',
    COALESCE(v_friend_shows_count, 0),
    '{}'::jsonb
  );
END;
$$;

-- ============================================
-- MASTER FUNCTION: Calculate all achievements for a user
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_all_achievements(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.calculate_genre_curator(p_user_id);
  PERFORM public.calculate_genre_specialist(p_user_id);
  PERFORM public.calculate_bucket_list_starter(p_user_id);
  PERFORM public.calculate_intentional_explorer(p_user_id);
  PERFORM public.calculate_set_break_scholar(p_user_id);
  PERFORM public.calculate_album_to_stage(p_user_id);
  PERFORM public.calculate_legacy_listener(p_user_id);
  PERFORM public.calculate_new_blood(p_user_id);
  PERFORM public.calculate_full_spectrum(p_user_id);
  PERFORM public.calculate_return_engagement(p_user_id);
  PERFORM public.calculate_festival_attendance(p_user_id);
  PERFORM public.calculate_artist_devotee(p_user_id);
  PERFORM public.calculate_venue_regular(p_user_id);
  PERFORM public.calculate_go_with_friends(p_user_id);
END;
$$;

-- ============================================
-- BACKFILL FUNCTION: Calculate achievements for all users
-- ============================================
CREATE OR REPLACE FUNCTION public.backfill_all_achievements()
RETURNS TABLE(
  processed_user_id UUID,
  achievements_calculated INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 14; -- Number of achievements
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.reviews
    WHERE is_draft = false
  LOOP
    BEGIN
      PERFORM public.calculate_all_achievements(v_user.user_id);
      processed_user_id := v_user.user_id;
      achievements_calculated := v_count;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with other users
      RAISE WARNING 'Error calculating achievements for user %: %', v_user.user_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION public.update_achievement_progress(UUID, TEXT, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_genre_curator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_genre_specialist(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_bucket_list_starter(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_intentional_explorer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_set_break_scholar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_album_to_stage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_legacy_listener(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_new_blood(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_full_spectrum(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_return_engagement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_festival_attendance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_artist_devotee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_venue_regular(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_go_with_friends(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_all_achievements(UUID) TO authenticated;

-- ============================================
-- TRIGGER FUNCTION: Auto-update achievements on review changes
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_update_achievements_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only update when review is published (not draft)
  IF NEW.is_draft = false THEN
    PERFORM public.calculate_all_achievements(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================
-- CREATE TRIGGER
-- ============================================
DROP TRIGGER IF EXISTS trigger_update_achievements_on_review_insert ON public.reviews;
CREATE TRIGGER trigger_update_achievements_on_review_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  WHEN (NEW.is_draft = false)
  EXECUTE FUNCTION public.trigger_update_achievements_on_review();

DROP TRIGGER IF EXISTS trigger_update_achievements_on_review_update ON public.reviews;
CREATE TRIGGER trigger_update_achievements_on_review_update
  AFTER UPDATE OF is_draft, was_there, review_text ON public.reviews
  FOR EACH ROW
  WHEN (NEW.is_draft = false)
  EXECUTE FUNCTION public.trigger_update_achievements_on_review();

