-- ============================================
-- VERIFICATION QUERIES FOR USER_PREFERENCES MIGRATION
-- ============================================

-- 1. Check backup table count
SELECT 
  'Backup Table' as table_name,
  COUNT(*) as row_count
FROM public.user_preferences_backup;

-- 2. Check signals count
SELECT 
  'Signals' as table_name,
  COUNT(*) as total_signals,
  COUNT(DISTINCT user_id) as unique_users
FROM public.user_preference_signals;

-- 3. Check preferences count
SELECT 
  'Preferences' as table_name,
  COUNT(*) as total_preferences,
  COUNT(DISTINCT user_id) as unique_users
FROM public.user_preferences;

-- 4. Check settings count
SELECT 
  'Settings' as table_name,
  COUNT(*) as total_settings,
  COUNT(DISTINCT user_id) as unique_users
FROM public.user_settings;

-- 5. Sample signals by type
SELECT 
  signal_type,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users
FROM public.user_preference_signals
GROUP BY signal_type
ORDER BY count DESC;

-- 6. Sample user preferences (top 5 users)
SELECT 
  user_id,
  jsonb_object_keys(genre_preference_scores) as top_genre,
  array_length(top_genres, 1) as top_genres_count,
  array_length(top_artists, 1) as top_artists_count,
  array_length(top_venues, 1) as top_venues_count,
  signal_count,
  last_computed_at
FROM public.user_preferences
ORDER BY signal_count DESC
LIMIT 5;

-- 7. Check genre preference scores
SELECT 
  user_id,
  jsonb_object_keys(genre_preference_scores) as genre,
  genre_preference_scores->>jsonb_object_keys(genre_preference_scores) as score
FROM public.user_preferences
WHERE jsonb_typeof(genre_preference_scores) = 'object'
  AND genre_preference_scores != '{}'::jsonb
LIMIT 10;

-- 8. Verify data consistency: backup vs new schema
SELECT 
  (SELECT COUNT(*) FROM public.user_preferences_backup) as backup_users,
  (SELECT COUNT(*) FROM public.user_preferences) as new_preferences_users,
  (SELECT COUNT(*) FROM public.user_settings) as settings_users,
  (SELECT COUNT(*) FROM public.user_preference_signals) as total_signals;

-- 9. Sample signals for a user (if you have a specific user_id to test)
-- Replace 'USER_ID_HERE' with an actual user_id from your backup
/*
SELECT 
  signal_type,
  entity_type,
  entity_name,
  genre,
  signal_weight,
  occurred_at
FROM public.user_preference_signals
WHERE user_id = 'USER_ID_HERE'
ORDER BY occurred_at DESC
LIMIT 20;
*/

