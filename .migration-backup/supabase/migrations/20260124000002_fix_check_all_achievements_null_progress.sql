-- ============================================
-- FIX: null value in column "current_progress" (23502)
-- ============================================
-- check_all_achievements can leave v_progress NULL when SELECT INTO returns
-- no rows (e.g. achievement_key not in get_achievement_progress) or in other
-- edge cases. Enforce v_progress := COALESCE(v_progress, 0) before INSERT.
-- ============================================

CREATE OR REPLACE FUNCTION public.check_all_achievements(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement RECORD;
  v_progress INTEGER;
  v_highest_tier TEXT;
  v_metadata JSONB;
BEGIN
  FOR v_achievement IN
    SELECT id, achievement_key, bronze_goal, silver_goal, gold_goal
    FROM public.achievements
    WHERE is_active = true
  LOOP
    v_progress := 0;
    v_highest_tier := NULL;
    v_metadata := '{}'::jsonb;

    CASE v_achievement.achievement_key
      WHEN 'genre_curator' THEN
        SELECT COUNT(DISTINCT genre)
        INTO v_progress
        FROM (
          SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre
          FROM public.reviews r
          INNER JOIN public.events e ON e.id = r.event_id
          WHERE r.user_id = p_user_id
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
          UNION
          SELECT UNNEST(a.genres) as genre
          FROM public.reviews r
          INNER JOIN public.events e ON e.id = r.event_id
          INNER JOIN public.artists a ON a.id = e.artist_id
          WHERE r.user_id = p_user_id
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND a.genres IS NOT NULL
            AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
        ) genre_list;

      WHEN 'genre_specialist' THEN
        SELECT COALESCE(MAX(genre_count), 0)
        INTO v_progress
        FROM (
          SELECT genre, COUNT(*) as genre_count
          FROM (
            SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR r.review_text IS NOT NULL)
              AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
            UNION ALL
            SELECT UNNEST(a.genres) as genre
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            INNER JOIN public.artists a ON a.id = e.artist_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR r.review_text IS NOT NULL)
              AND a.genres IS NOT NULL
              AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
          ) genre_list
          GROUP BY genre
        ) genre_counts;

      WHEN 'bucket_list_starter' THEN
        SELECT COUNT(DISTINCT r.event_id)
        INTO v_progress
        FROM public.reviews r
        INNER JOIN public.events e ON e.id = r.event_id
        WHERE r.user_id = p_user_id
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND (
            EXISTS (
              SELECT 1 FROM public.bucket_list bl
              INNER JOIN public.entities ent ON ent.id = bl.entity_id
              WHERE bl.user_id = p_user_id
                AND ent.entity_type = 'artist'
                AND ent.entity_uuid = e.artist_id
            )
            OR EXISTS (
              SELECT 1 FROM public.bucket_list bl
              INNER JOIN public.entities ent ON ent.id = bl.entity_id
              WHERE bl.user_id = p_user_id
                AND ent.entity_type = 'venue'
                AND ent.entity_uuid = e.venue_id
            )
          );

      WHEN 'intentional_explorer' THEN
        SELECT COALESCE(MAX(venue_count), 0)
        INTO v_progress
        FROM (
          SELECT genre, COUNT(DISTINCT venue_id) as venue_count
          FROM (
            SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre, e.venue_id
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
              AND (r.is_draft = false OR r.is_draft IS NULL)
              AND e.genres IS NOT NULL
              AND e.venue_id IS NOT NULL
            UNION
            SELECT UNNEST(a.genres) as genre, e.venue_id
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            INNER JOIN public.artists a ON a.id = e.artist_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
              AND (r.is_draft = false OR r.is_draft IS NULL)
              AND a.genres IS NOT NULL
              AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
              AND e.venue_id IS NOT NULL
          ) genre_venues
          GROUP BY genre
        ) gv;

      WHEN 'festival_attendance' THEN
        SELECT COUNT(DISTINCT r.event_id)
        INTO v_progress
        FROM public.reviews r
        INNER JOIN public.events e ON e.id = r.event_id
        LEFT JOIN public.venues v ON v.id = e.venue_id
        WHERE r.user_id = p_user_id
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND (
            COALESCE(v.name, e.venue_city, '') ILIKE '%festival%'
            OR COALESCE(v.name, e.venue_city, '') ILIKE '%fest%'
            OR COALESCE(v.name, e.venue_city, '') ILIKE '%gathering%'
            OR COALESCE(v.name, e.venue_city, '') ILIKE '%fair%'
            OR e.title ILIKE '%festival%'
            OR e.title ILIKE '%fest %'
          );

      WHEN 'artist_devotee' THEN
        SELECT COALESCE(MAX(cnt), 0)
        INTO v_progress
        FROM (
          SELECT COUNT(*) as cnt
          FROM public.reviews r
          INNER JOIN public.events e ON e.id = r.event_id
          WHERE r.user_id = p_user_id
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND e.artist_id IS NOT NULL
          GROUP BY e.artist_id
        ) per_artist;

      WHEN 'venue_regular' THEN
        SELECT current_progress
        INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = 'venue_loyalist'
        LIMIT 1;

      WHEN 'go_with_friends' THEN
        SELECT current_progress
        INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = 'connector'
        LIMIT 1;

      ELSE
        SELECT current_progress
        INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = v_achievement.achievement_key
        LIMIT 1;
    END CASE;

    -- Ensure current_progress is never NULL (NOT NULL constraint on user_achievement_progress)
    v_progress := COALESCE(v_progress, 0);

    IF v_progress >= v_achievement.gold_goal THEN
      v_highest_tier := 'gold';
    ELSIF v_progress >= v_achievement.silver_goal THEN
      v_highest_tier := 'silver';
    ELSIF v_progress >= v_achievement.bronze_goal THEN
      v_highest_tier := 'bronze';
    END IF;

    INSERT INTO public.user_achievement_progress (
      user_id, achievement_id, current_progress, highest_tier_achieved, progress_metadata, updated_at
    )
    VALUES (p_user_id, v_achievement.id, v_progress, v_highest_tier, v_metadata, now())
    ON CONFLICT (user_id, achievement_id)
    DO UPDATE SET
      current_progress = EXCLUDED.current_progress,
      highest_tier_achieved = EXCLUDED.highest_tier_achieved,
      progress_metadata = EXCLUDED.progress_metadata,
      updated_at = now(),
      bronze_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved IN ('bronze', 'silver', 'gold')
         AND user_achievement_progress.bronze_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.bronze_achieved_at
      END,
      silver_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved IN ('silver', 'gold')
         AND user_achievement_progress.silver_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.silver_achieved_at
      END,
      gold_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved = 'gold'
         AND user_achievement_progress.gold_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.gold_achieved_at
      END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_all_achievements(UUID) TO authenticated;
