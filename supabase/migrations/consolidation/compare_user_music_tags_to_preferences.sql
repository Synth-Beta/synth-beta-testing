-- ============================================
-- COMPARE user_music_tags vs user_genre_preferences
-- ============================================
-- This script compares the two tables to determine if they should be consolidated

-- ============================================
-- PART A: Structure Comparison
-- ============================================
SELECT 
  'user_music_tags Structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_music_tags'
ORDER BY ordinal_position;

SELECT 
  'user_genre_preferences Structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_genre_preferences'
ORDER BY ordinal_position;

-- ============================================
-- PART B: Data Comparison
-- ============================================
-- Check overlap: users with data in both tables
SELECT 
  'Data Overlap Check' as check_type,
  COUNT(DISTINCT umt.user_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.user_genre_preferences ugp 
    WHERE ugp.user_id = umt.user_id
  )) as users_in_both_tables,
  COUNT(DISTINCT umt.user_id) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM public.user_genre_preferences ugp 
    WHERE ugp.user_id = umt.user_id
  )) as users_only_in_music_tags,
  COUNT(DISTINCT umt.user_id) as total_users_in_music_tags,
  (
    SELECT COUNT(DISTINCT user_id) FROM public.user_genre_preferences
  ) as total_users_in_genre_prefs
FROM public.user_music_tags umt;

-- Check genre overlap (same genre names)
SELECT 
  'Genre Value Overlap' as check_type,
  COUNT(DISTINCT umt.tag_value) FILTER (
    WHERE umt.tag_type = 'genre'
    AND EXISTS (
      SELECT 1 FROM public.user_genre_preferences ugp
      WHERE ugp.user_id = umt.user_id
        AND LOWER(ugp.genre) = LOWER(umt.tag_value)
    )
  ) as overlapping_genres,
  COUNT(DISTINCT umt.tag_value) FILTER (WHERE umt.tag_type = 'genre') as total_genres_in_music_tags,
  (
    SELECT COUNT(DISTINCT genre) FROM public.user_genre_preferences
  ) as total_genres_in_preferences
FROM public.user_music_tags umt;

-- Sample data from each table
SELECT 
  'Sample user_music_tags' as check_type,
  user_id,
  tag_type,
  tag_value,
  tag_source,
  weight,
  created_at
FROM public.user_music_tags
ORDER BY created_at DESC
LIMIT 5;

SELECT 
  'Sample user_genre_preferences' as check_type,
  user_id,
  genre,
  interaction_type,
  source_entity_type,
  preference_score,
  created_at
FROM public.user_genre_preferences
ORDER BY created_at DESC
LIMIT 5;

