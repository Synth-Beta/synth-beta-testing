-- ============================================
-- DATABASE CONSOLIDATION: PHASE 3 - MIGRATE PREFERENCES
-- ============================================
-- This migration migrates preferences, streaming stats, and achievements to user_preferences table
-- Run this AFTER Phase 3.4 (migrate analytics) is complete

-- ============================================
-- 3.5.1 CREATE USER_PREFERENCES ROWS FOR ALL USERS
-- ============================================

-- Create user_preferences_new rows for all users (if they don't exist)
INSERT INTO public.user_preferences_new (
  user_id,
  preferred_genres,
  preferred_artists,
  preferred_venues,
  notification_preferences,
  email_preferences,
  privacy_settings,
  streaming_stats,
  achievements,
  music_preference_signals,
  recommendation_cache,
  created_at,
  updated_at
)
SELECT 
  u.user_id,
  ARRAY[]::TEXT[] as preferred_genres,
  ARRAY[]::UUID[] as preferred_artists,
  ARRAY[]::TEXT[] as preferred_venues,
  '{}'::JSONB as notification_preferences,
  '{}'::JSONB as email_preferences,
  '{}'::JSONB as privacy_settings,
  '{}'::JSONB as streaming_stats,
  '{}'::JSONB as achievements,
  '[]'::JSONB as music_preference_signals,
  '[]'::JSONB as recommendation_cache,
  u.created_at,
  u.updated_at
FROM public.users_new u
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- 3.5.2 MIGRATE STREAMING_PROFILES → USER_PREFERENCES
-- ============================================

-- Migrate streaming_profiles to user_preferences_new.streaming_stats
UPDATE public.user_preferences_new up
SET streaming_stats = COALESCE(up.streaming_stats, '{}'::JSONB) || jsonb_build_object(
  sp.service_type, jsonb_build_object(
    'profile_data', sp.profile_data,
    'sync_status', sp.sync_status,
    'last_updated', sp.last_updated,
    'created_at', sp.created_at
  )
)
FROM public.streaming_profiles sp
WHERE up.user_id = sp.user_id
  AND EXISTS (SELECT 1 FROM public.users_new u WHERE u.user_id = sp.user_id);

-- Verify migration
DO $$
DECLARE
  v_streaming_profiles_count INTEGER;
  v_users_with_streaming_stats INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_streaming_profiles_count FROM public.streaming_profiles;
  SELECT COUNT(*) INTO v_users_with_streaming_stats 
  FROM public.user_preferences_new 
  WHERE streaming_stats != '{}'::JSONB;
  
  RAISE NOTICE 'Streaming profiles migration: streaming_profiles=%, users with streaming_stats=%', 
    v_streaming_profiles_count, v_users_with_streaming_stats;
END $$;

-- ============================================
-- 3.5.3 MIGRATE USER_STREAMING_STATS_SUMMARY → USER_PREFERENCES
-- ============================================

-- Migrate user_streaming_stats_summary to user_preferences_new.streaming_stats
-- Merge with existing streaming_stats JSONB
-- Note: We use a CASE statement to handle dynamic key extraction since -> requires a string literal
UPDATE public.user_preferences_new up
SET streaming_stats = COALESCE(up.streaming_stats, '{}'::JSONB) || jsonb_build_object(
  uss.service_type, 
  CASE 
    WHEN uss.service_type = 'spotify' THEN COALESCE(up.streaming_stats->'spotify', '{}'::JSONB)
    WHEN uss.service_type = 'apple-music' THEN COALESCE(up.streaming_stats->'apple-music', '{}'::JSONB)
    ELSE '{}'::JSONB
  END || jsonb_build_object(
    'top_artists', uss.top_artists,
    'top_genres', uss.top_genres,
    'total_tracks', uss.total_tracks,
    'unique_artists', uss.unique_artists,
    'total_listening_hours', uss.total_listening_hours,
    'last_updated', uss.last_updated
  )
)
FROM public.user_streaming_stats_summary uss
WHERE up.user_id = uss.user_id
  AND EXISTS (SELECT 1 FROM public.users_new u WHERE u.user_id = uss.user_id);

-- Extract preferred genres from streaming_stats
-- Handle both structures: array of strings ["rock", "pop"] or array of objects [{"genre": "rock"}, {"name": "pop"}]
UPDATE public.user_preferences_new up
SET preferred_genres = ARRAY(
  SELECT DISTINCT COALESCE(
    -- If it's an object with 'genre' field, extract it
    CASE WHEN jsonb_typeof(genre_elem.value) = 'object' THEN genre_elem.value->>'genre' ELSE NULL END,
    -- If it's an object with 'name' field, extract it
    CASE WHEN jsonb_typeof(genre_elem.value) = 'object' THEN genre_elem.value->>'name' ELSE NULL END,
    -- If it's a string, use it directly
    CASE WHEN jsonb_typeof(genre_elem.value) = 'string' THEN genre_elem.value::TEXT ELSE NULL END,
    -- If it's an array, extract elements (recursive case)
    NULL
  ) AS genre_text
  FROM jsonb_array_elements(
    CASE 
      WHEN up.streaming_stats->'spotify'->'top_genres' IS NOT NULL 
      THEN up.streaming_stats->'spotify'->'top_genres'
      WHEN up.streaming_stats->'apple-music'->'top_genres' IS NOT NULL 
      THEN up.streaming_stats->'apple-music'->'top_genres'
      ELSE '[]'::JSONB
    END
  ) AS genre_elem(value)
  WHERE COALESCE(
    CASE WHEN jsonb_typeof(genre_elem.value) = 'object' THEN genre_elem.value->>'genre' ELSE NULL END,
    CASE WHEN jsonb_typeof(genre_elem.value) = 'object' THEN genre_elem.value->>'name' ELSE NULL END,
    CASE WHEN jsonb_typeof(genre_elem.value) = 'string' THEN genre_elem.value::TEXT ELSE NULL END
  ) IS NOT NULL
)
WHERE up.streaming_stats != '{}'::JSONB
  AND (up.streaming_stats->'spotify'->'top_genres' IS NOT NULL 
    OR up.streaming_stats->'apple-music'->'top_genres' IS NOT NULL);

-- Verify migration
DO $$
DECLARE
  v_streaming_stats_summary_count INTEGER;
  v_users_with_streaming_stats INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_streaming_stats_summary_count FROM public.user_streaming_stats_summary;
  SELECT COUNT(*) INTO v_users_with_streaming_stats 
  FROM public.user_preferences_new 
  WHERE streaming_stats != '{}'::JSONB;
  
  RAISE NOTICE 'Streaming stats summary migration: user_streaming_stats_summary=%, users with streaming_stats=%', 
    v_streaming_stats_summary_count, v_users_with_streaming_stats;
END $$;

-- ============================================
-- 3.5.4 MIGRATE MUSIC_PREFERENCE_SIGNALS → USER_PREFERENCES
-- ============================================

-- Migrate music_preference_signals to user_preferences_new.music_preference_signals
-- Convert rows to JSONB array
UPDATE public.user_preferences_new up
SET music_preference_signals = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'preference_type', mps.preference_type,
      'preference_value', mps.preference_value,
      'preference_score', mps.preference_score,
      'interaction_count', mps.interaction_count,
      'interaction_types', mps.interaction_types,
      'first_interaction', mps.first_interaction,
      'last_interaction', mps.last_interaction,
      'trend', mps.trend,
      'confidence', mps.confidence,
      'metadata', mps.metadata
    ) ORDER BY mps.preference_score DESC
  )
  FROM public.music_preference_signals mps
  WHERE mps.user_id = up.user_id
)
WHERE EXISTS (SELECT 1 FROM public.music_preference_signals mps WHERE mps.user_id = up.user_id);

-- Extract preferred genres and artists from music_preference_signals
-- Use GROUP BY to get distinct values with max score, then order by score
UPDATE public.user_preferences_new up
SET 
  preferred_genres = ARRAY(
    SELECT mps.preference_value::TEXT
    FROM (
      SELECT 
        mps.preference_value,
        MAX(mps.preference_score) as max_score
      FROM public.music_preference_signals mps
      WHERE mps.user_id = up.user_id
        AND mps.preference_type = 'genre'
      GROUP BY mps.preference_value
      ORDER BY max_score DESC
      LIMIT 20
    ) mps
  ),
  preferred_artists = ARRAY(
    SELECT an.id
    FROM (
      SELECT 
        mps.preference_value,
        MAX(mps.preference_score) as max_score
      FROM public.music_preference_signals mps
      WHERE mps.user_id = up.user_id
        AND mps.preference_type = 'artist'
      GROUP BY mps.preference_value
      ORDER BY max_score DESC
      LIMIT 20
    ) mps
    JOIN public.artists_new an ON mps.preference_value = an.name
  )
WHERE EXISTS (SELECT 1 FROM public.music_preference_signals mps WHERE mps.user_id = up.user_id);

-- Verify migration
DO $$
DECLARE
  v_music_preference_signals_count INTEGER;
  v_users_with_preference_signals INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_music_preference_signals_count FROM public.music_preference_signals;
  SELECT COUNT(*) INTO v_users_with_preference_signals 
  FROM public.user_preferences_new 
  WHERE music_preference_signals != '[]'::JSONB;
  
  RAISE NOTICE 'Music preference signals migration: music_preference_signals=%, users with preference_signals=%', 
    v_music_preference_signals_count, v_users_with_preference_signals;
END $$;

-- ============================================
-- 3.5.5 MIGRATE USER_RECOMMENDATIONS_CACHE → USER_PREFERENCES
-- ============================================

-- Migrate user_recommendations_cache to user_preferences_new.recommendation_cache
-- Convert rows to JSONB array
UPDATE public.user_preferences_new up
SET recommendation_cache = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'recommended_user_id', urc.recommended_user_id,
      'recommendation_score', urc.recommendation_score,
      'connection_degree', urc.connection_degree,
      'connection_label', urc.connection_label,
      'shared_artists_count', urc.shared_artists_count,
      'shared_venues_count', urc.shared_venues_count,
      'shared_genres_count', urc.shared_genres_count,
      'shared_events_count', urc.shared_events_count,
      'mutual_friends_count', urc.mutual_friends_count,
      'recommendation_reasons', urc.recommendation_reasons,
      'last_calculated_at', urc.last_calculated_at
    )
  )
  FROM (
    SELECT *
    FROM public.user_recommendations_cache
    WHERE user_id = up.user_id
    ORDER BY recommendation_score DESC
  ) urc
)
WHERE EXISTS (SELECT 1 FROM public.user_recommendations_cache urc WHERE urc.user_id = up.user_id);

-- Verify migration
DO $$
DECLARE
  v_user_recommendations_cache_count INTEGER;
  v_users_with_recommendations INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_user_recommendations_cache_count FROM public.user_recommendations_cache;
  SELECT COUNT(*) INTO v_users_with_recommendations 
  FROM public.user_preferences_new 
  WHERE recommendation_cache != '[]'::JSONB;
  
  RAISE NOTICE 'User recommendations cache migration: user_recommendations_cache=%, users with recommendations=%', 
    v_user_recommendations_cache_count, v_users_with_recommendations;
END $$;

-- ============================================
-- 3.5.6 CALCULATE ACHIEVEMENTS
-- ============================================

-- Calculate achievements based on user data
-- This is a simplified version - you may want to expand this based on your achievement system
UPDATE public.user_preferences_new up
SET achievements = jsonb_build_object(
  'unlocked', (
    SELECT jsonb_agg(achievement_name)
    FROM (
      SELECT 'first_review' as achievement_name
      WHERE EXISTS (SELECT 1 FROM public.reviews_new r WHERE r.user_id = up.user_id)
      UNION ALL
      SELECT 'ten_reviews' as achievement_name
      WHERE (SELECT COUNT(*) FROM public.reviews_new r WHERE r.user_id = up.user_id) >= 10
      UNION ALL
      SELECT 'hundred_reviews' as achievement_name
      WHERE (SELECT COUNT(*) FROM public.reviews_new r WHERE r.user_id = up.user_id) >= 100
      UNION ALL
      SELECT 'first_follow' as achievement_name
      WHERE EXISTS (SELECT 1 FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.relationship_type = 'follow')
      UNION ALL
      SELECT 'ten_follows' as achievement_name
      WHERE (SELECT COUNT(*) FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.relationship_type = 'follow') >= 10
      UNION ALL
      SELECT 'first_friend' as achievement_name
      WHERE EXISTS (SELECT 1 FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.relationship_type = 'friend' AND r.status = 'accepted')
      UNION ALL
      SELECT 'ten_friends' as achievement_name
      WHERE (SELECT COUNT(*) FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.relationship_type = 'friend' AND r.status = 'accepted') >= 10
      UNION ALL
      SELECT 'first_event_interest' as achievement_name
      WHERE EXISTS (SELECT 1 FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.related_entity_type = 'event')
      UNION ALL
      SELECT 'ten_event_interests' as achievement_name
      WHERE (SELECT COUNT(*) FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.related_entity_type = 'event') >= 10
    ) AS achievements_list
  ),
  'in_progress', (
    SELECT jsonb_agg(achievement_name)
    FROM (
      SELECT 'five_reviews' as achievement_name
      WHERE (SELECT COUNT(*) FROM public.reviews_new r WHERE r.user_id = up.user_id) >= 5
        AND (SELECT COUNT(*) FROM public.reviews_new r WHERE r.user_id = up.user_id) < 10
      UNION ALL
      SELECT 'five_follows' as achievement_name
      WHERE (SELECT COUNT(*) FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.relationship_type = 'follow') >= 5
        AND (SELECT COUNT(*) FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.relationship_type = 'follow') < 10
      UNION ALL
      SELECT 'five_friends' as achievement_name
      WHERE (SELECT COUNT(*) FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.relationship_type = 'friend' AND r.status = 'accepted') >= 5
        AND (SELECT COUNT(*) FROM public.relationships_new r WHERE r.user_id = up.user_id AND r.relationship_type = 'friend' AND r.status = 'accepted') < 10
    ) AS achievements_list
  )
)
WHERE EXISTS (SELECT 1 FROM public.users_new u WHERE u.user_id = up.user_id);

-- ============================================
-- 3.5.7 MIGRATE NOTIFICATION AND EMAIL PREFERENCES
-- ============================================

-- Migrate notification preferences from profiles (if they exist)
-- Note: This is a placeholder - adjust based on your actual notification preferences structure
UPDATE public.user_preferences_new up
SET 
  notification_preferences = jsonb_build_object(
    'similar_users_notifications', u.similar_users_notifications,
    'friend_requests', true,
    'friend_accepted', true,
    'event_interest', true,
    'review_liked', true,
    'review_commented', true
  ),
  email_preferences = jsonb_build_object(
    'marketing_emails', true,
    'newsletter', true,
    'event_updates', true
  ),
  privacy_settings = jsonb_build_object(
    'is_public_profile', u.is_public_profile,
    'show_email', false,
    'show_phone', false
  )
FROM public.users_new u
WHERE up.user_id = u.user_id
  AND up.notification_preferences = '{}'::JSONB;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all preferences migrated
SELECT 
  'Preferences migration complete' as status,
  (SELECT COUNT(*) FROM public.user_preferences_new) as total_user_preferences_count,
  (SELECT COUNT(*) FROM public.user_preferences_new WHERE streaming_stats != '{}'::JSONB) as users_with_streaming_stats_count,
  (SELECT COUNT(*) FROM public.user_preferences_new WHERE music_preference_signals != '[]'::JSONB) as users_with_preference_signals_count,
  (SELECT COUNT(*) FROM public.user_preferences_new WHERE recommendation_cache != '[]'::JSONB) as users_with_recommendations_count,
  (SELECT COUNT(*) FROM public.user_preferences_new WHERE achievements != '{}'::JSONB) as users_with_achievements_count,
  (SELECT COUNT(*) FROM public.user_preferences_new WHERE array_length(preferred_genres, 1) > 0) as users_with_preferred_genres_count,
  (SELECT COUNT(*) FROM public.user_preferences_new WHERE array_length(preferred_artists, 1) > 0) as users_with_preferred_artists_count,
  (SELECT COUNT(*) FROM public.streaming_profiles) as streaming_profiles_old_count,
  (SELECT COUNT(*) FROM public.user_streaming_stats_summary) as user_streaming_stats_summary_old_count,
  (SELECT COUNT(*) FROM public.music_preference_signals) as music_preference_signals_old_count,
  (SELECT COUNT(*) FROM public.user_recommendations_cache) as user_recommendations_cache_old_count;

