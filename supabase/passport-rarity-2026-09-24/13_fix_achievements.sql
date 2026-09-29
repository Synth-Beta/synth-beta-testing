-- Achievements: unstarve them. 2026-09-27. REVIEW ONLY, NOT APPLIED.
--
-- SAME ROOT CAUSE AS THE STAMPS. Every branch of check_all_achievements did:
--     FROM public.reviews r INNER JOIN public.events e ON e.id = r.event_id
-- reviews.event_id is always NULL here, and an INNER JOIN on NULL matches zero
-- rows, so v_progress was 0 for genre_curator, genre_specialist,
-- bucket_list_starter, intentional_explorer, festival_attendance and
-- artist_devotee -- six of ten, unconditionally. Measured: 297/300 rows at 0,
-- best progress 1, zero tiers ever earned by anyone.
--
-- Fix: read artist/venue straight off the review. Genres come from
-- artists.genres via reviews.artist_id (events.genres is unreachable without an
-- event_id). Per the genre backfill work, artists.genres has THREE empty states
-- -- NULL, '{}' and the literal 'small artist' -- all excluded below.
--
-- Also applies is_draft = false consistently. The original only filtered drafts
-- on intentional_explorer, so drafts could inflate the other five.
--
-- The remaining four (venue_regular, go_with_friends, new_blood,
-- return_engagement) delegate to get_achievement_progress(), which counts
-- passport_entries. Those unblock once the stamp backfill runs -- but SEE THE
-- NOTE AT THE BOTTOM: that function may carry the same event_id bug.

CREATE OR REPLACE FUNCTION public.check_all_achievements(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

      -- Distinct genres across the artists this user reviewed.
      WHEN 'genre_curator' THEN
        SELECT count(DISTINCT g) INTO v_progress
        FROM public.reviews r
        JOIN public.artists a ON a.id = r.artist_id
        CROSS JOIN LATERAL unnest(coalesce(a.genres, ARRAY[]::text[])) AS g
        WHERE r.user_id = p_user_id
          AND r.is_draft = false
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND g <> '' AND lower(g) <> 'small artist';

      -- Deepest single genre.
      WHEN 'genre_specialist' THEN
        SELECT coalesce(max(c), 0) INTO v_progress
        FROM (
          SELECT g, count(*) AS c
          FROM public.reviews r
          JOIN public.artists a ON a.id = r.artist_id
          CROSS JOIN LATERAL unnest(coalesce(a.genres, ARRAY[]::text[])) AS g
          WHERE r.user_id = p_user_id
            AND r.is_draft = false
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND g <> '' AND lower(g) <> 'small artist'
          GROUP BY g
        ) s;

      -- Reviews whose artist or venue was on the user's bucket list.
      WHEN 'bucket_list_starter' THEN
        SELECT count(*) INTO v_progress
        FROM public.reviews r
        WHERE r.user_id = p_user_id
          AND r.is_draft = false
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND EXISTS (
            SELECT 1
            FROM public.bucket_list bl
            JOIN public.entities ent ON ent.id = bl.entity_id
            WHERE bl.user_id = p_user_id
              AND ((ent.entity_type = 'artist' AND ent.entity_uuid = r.artist_id)
                OR (ent.entity_type = 'venue'  AND ent.entity_uuid = r.venue_id))
          );

      -- Most distinct venues seen within a single genre.
      WHEN 'intentional_explorer' THEN
        SELECT coalesce(max(vc), 0) INTO v_progress
        FROM (
          SELECT g, count(DISTINCT r.venue_id) AS vc
          FROM public.reviews r
          JOIN public.artists a ON a.id = r.artist_id
          CROSS JOIN LATERAL unnest(coalesce(a.genres, ARRAY[]::text[])) AS g
          WHERE r.user_id = p_user_id
            AND r.is_draft = false
            AND (r.was_there = true
                 OR (r.review_text IS NOT NULL AND r.review_text <> 'ATTENDANCE_ONLY'))
            AND r.venue_id IS NOT NULL
            AND g <> '' AND lower(g) <> 'small artist'
          GROUP BY g
        ) gv;

      -- Festival-ish venues. e.title is gone with the event join, so this now
      -- matches on venue name only.
      WHEN 'festival_attendance' THEN
        SELECT count(*) INTO v_progress
        FROM public.reviews r
        LEFT JOIN public.venues v ON v.id = r.venue_id
        WHERE r.user_id = p_user_id
          AND r.is_draft = false
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND coalesce(v.name, '') ~* '(festival|fest|gathering|fair)';

      -- Most times seeing one artist.
      WHEN 'artist_devotee' THEN
        SELECT coalesce(max(cnt), 0) INTO v_progress
        FROM (
          SELECT count(*) AS cnt
          FROM public.reviews r
          WHERE r.user_id = p_user_id
            AND r.is_draft = false
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND r.artist_id IS NOT NULL
          GROUP BY r.artist_id
        ) per_artist;

      WHEN 'venue_regular' THEN
        SELECT current_progress INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = 'venue_loyalist' LIMIT 1;

      WHEN 'go_with_friends' THEN
        SELECT current_progress INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = 'connector' LIMIT 1;

      ELSE
        SELECT current_progress INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = v_achievement.achievement_key LIMIT 1;
    END CASE;

    v_progress := coalesce(v_progress, 0);

    IF v_progress >= v_achievement.gold_goal THEN
      v_highest_tier := 'gold';
    ELSIF v_progress >= v_achievement.silver_goal THEN
      v_highest_tier := 'silver';
    ELSIF v_progress >= v_achievement.bronze_goal THEN
      v_highest_tier := 'bronze';
    END IF;

    INSERT INTO public.user_achievement_progress (
      user_id, achievement_id, current_progress, highest_tier_achieved,
      progress_metadata, updated_at
    )
    VALUES (p_user_id, v_achievement.id, v_progress, v_highest_tier, v_metadata, now())
    ON CONFLICT (user_id, achievement_id)
    DO UPDATE SET
      current_progress      = EXCLUDED.current_progress,
      highest_tier_achieved = EXCLUDED.highest_tier_achieved,
      progress_metadata     = EXCLUDED.progress_metadata,
      updated_at            = now(),
      bronze_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved IN ('bronze','silver','gold')
         AND user_achievement_progress.bronze_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.bronze_achieved_at END,
      silver_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved IN ('silver','gold')
         AND user_achievement_progress.silver_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.silver_achieved_at END,
      gold_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved = 'gold'
         AND user_achievement_progress.gold_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.gold_achieved_at END;
  END LOOP;
END;
$function$;


-- Recompute for everyone who has ever published a review. Calls the function
-- directly; does NOT touch reviews rows, which carry 12 triggers including
-- notification ones.
DO $do$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.reviews WHERE is_draft = false
  LOOP
    PERFORM public.check_all_achievements(u);
  END LOOP;
END
$do$;


-- VERIFY -------------------------------------------------------------------
-- Was anything earned at last? Before this, every row was '(none)'.
SELECT coalesce(highest_tier_achieved, '(none)') AS tier,
       count(*) AS rows, count(DISTINCT user_id) AS users
FROM public.user_achievement_progress GROUP BY 1 ORDER BY 1;

-- Per achievement: progress should no longer be uniformly 0.
SELECT a.achievement_key, a.bronze_goal,
       max(p.current_progress) AS best,
       count(*) FILTER (WHERE p.highest_tier_achieved IS NOT NULL) AS earned
FROM public.achievements a
LEFT JOIN public.user_achievement_progress p ON p.achievement_id = a.id
WHERE a.is_active
GROUP BY a.achievement_key, a.bronze_goal, a.sort_order ORDER BY a.sort_order;


-- STILL TO CHECK -----------------------------------------------------------
-- Four achievements (venue_regular, go_with_friends, new_blood,
-- return_engagement) delegate to get_achievement_progress(), which reads BOTH
-- passport_entries and reviews. If it joins events on r.event_id it has the
-- same bug and those four stay at zero no matter what. Send me this:
SELECT pg_get_functiondef(p.oid) AS get_achievement_progress
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_achievement_progress';
