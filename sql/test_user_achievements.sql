-- ============================================
-- TEST ACHIEVEMENTS FOR SPECIFIC USER
-- User ID: 349bda34-7878-4c10-9f86-ec5888e55571
-- ============================================

-- Step 1: Calculate all achievements for this user
SELECT public.calculate_all_achievements('349bda34-7878-4c10-9f86-ec5888e55571');

-- Step 2: Check the results
SELECT 
  a.achievement_key,
  a.name,
  uap.current_progress,
  uap.highest_tier_achieved,
  a.bronze_goal as "Bronze",
  a.silver_goal as "Silver",
  a.gold_goal as "Gold",
  CASE 
    WHEN uap.current_progress >= a.gold_goal THEN '🎉 Gold!'
    WHEN uap.current_progress >= a.silver_goal THEN '🥈 Silver!'
    WHEN uap.current_progress >= a.bronze_goal THEN '🥉 Bronze!'
    ELSE CONCAT(uap.current_progress, '/', a.bronze_goal)
  END as status
FROM public.user_achievement_progress uap
INNER JOIN public.achievements a ON a.id = uap.achievement_id
WHERE uap.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
ORDER BY a.sort_order;

-- Step 3: Check how many reviews this user has
SELECT 
  COUNT(*) as total_reviews,
  COUNT(DISTINCT event_id) as unique_events,
  COUNT(DISTINCT artist_id) as unique_artists,
  COUNT(DISTINCT venue_id) as unique_venues
FROM public.reviews
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
  AND is_draft = false
  AND (was_there = true OR (review_text IS NOT NULL AND review_text != 'ATTENDANCE_ONLY'));

-- Step 4: Check genres attended
SELECT 
  COUNT(DISTINCT genre) as genres_count,
  array_agg(DISTINCT genre ORDER BY genre) as genres_list
FROM (
  SELECT UNNEST(e.genres) as genre
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
    AND r.is_draft = false
    AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
    AND e.genres IS NOT NULL
) genre_list;


