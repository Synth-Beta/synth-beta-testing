-- Debug script to check why genre achievements aren't working
-- Run this to see what data is available for genre calculations

-- 1. Check if user has reviews
SELECT 
  COUNT(*) as total_reviews,
  COUNT(*) FILTER (WHERE was_there = true) as reviews_with_was_there,
  COUNT(*) FILTER (WHERE review_text IS NOT NULL) as reviews_with_text,
  COUNT(*) FILTER (WHERE was_there = true OR review_text IS NOT NULL) as eligible_reviews
FROM public.reviews
WHERE user_id = 'YOUR_USER_ID_HERE'; -- Replace with actual user ID

-- 2. Check if events have genres
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE genres IS NOT NULL AND genres != ARRAY[]::TEXT[]) as events_with_genres,
  COUNT(*) FILTER (WHERE genres IS NULL OR genres = ARRAY[]::TEXT[]) as events_without_genres
FROM public.events e
INNER JOIN public.reviews r ON r.event_id = e.id
WHERE r.user_id = 'YOUR_USER_ID_HERE'
  AND (r.was_there = true OR r.review_text IS NOT NULL);

-- 3. Check if artists have genres (for fallback)
SELECT 
  COUNT(*) as total_artists,
  COUNT(*) FILTER (WHERE a.genres IS NOT NULL AND array_length(a.genres, 1) > 0) as artists_with_genres
FROM public.reviews r
INNER JOIN public.events e ON e.id = r.event_id
INNER JOIN public.artists a ON a.id = e.artist_id
WHERE r.user_id = 'YOUR_USER_ID_HERE'
  AND (r.was_there = true OR r.review_text IS NOT NULL);

-- 4. Check actual genre counts from events
SELECT 
  COUNT(DISTINCT genre) as distinct_genres_from_events
FROM (
  SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = 'YOUR_USER_ID_HERE'
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
) genre_list;

-- 5. Check actual genre counts from artists (fallback)
SELECT 
  COUNT(DISTINCT genre) as distinct_genres_from_artists
FROM (
  SELECT UNNEST(a.genres) as genre
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  INNER JOIN public.artists a ON a.id = e.artist_id
  WHERE r.user_id = 'YOUR_USER_ID_HERE'
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    AND a.genres IS NOT NULL
    AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
) genre_list;

-- 6. Combined genre count (what the achievement should see)
SELECT 
  COUNT(DISTINCT genre) as total_distinct_genres
FROM (
  SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = 'YOUR_USER_ID_HERE'
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
  UNION
  SELECT UNNEST(a.genres) as genre
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  INNER JOIN public.artists a ON a.id = e.artist_id
  WHERE r.user_id = 'YOUR_USER_ID_HERE'
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    AND a.genres IS NOT NULL
    AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
) genre_list;

-- 7. Check current achievement progress
SELECT 
  a.achievement_key,
  a.name,
  uap.current_progress,
  uap.highest_tier_achieved,
  a.bronze_goal,
  a.silver_goal,
  a.gold_goal
FROM public.user_achievement_progress uap
INNER JOIN public.achievements a ON a.id = uap.achievement_id
WHERE uap.user_id = 'YOUR_USER_ID_HERE'
  AND a.achievement_key IN ('genre_curator', 'genre_specialist');
