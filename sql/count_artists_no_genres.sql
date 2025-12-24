-- Count artists with no genres
-- This query counts artists where genres is NULL or an empty array

SELECT COUNT(*) as artists_with_no_genres
FROM public.artists
WHERE genres IS NULL 
   OR array_length(genres, 1) IS NULL 
   OR array_length(genres, 1) = 0;

-- Alternative simpler version using COALESCE:
-- SELECT COUNT(*) as artists_with_no_genres
-- FROM public.artists
-- WHERE COALESCE(array_length(genres, 1), 0) = 0;

-- If you want to see the breakdown:
-- SELECT 
--   COUNT(*) FILTER (WHERE genres IS NULL) as null_genres,
--   COUNT(*) FILTER (WHERE genres IS NOT NULL AND array_length(genres, 1) = 0) as empty_array_genres,
--   COUNT(*) FILTER (WHERE genres IS NULL OR array_length(genres, 1) IS NULL OR array_length(genres, 1) = 0) as total_no_genres,
--   COUNT(*) as total_artists
-- FROM public.artists;

