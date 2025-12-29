-- Find artists created today with no genres
-- Handles both NULL and empty array cases

SELECT 
    id,
    name,
    identifier,
    url,
    image_url,
    artist_type,
    band_or_musician,
    genres,
    created_at,
    updated_at,
    last_synced_at
FROM public.artists
WHERE 
    -- Created today (using date comparison to handle timezone)
    DATE(created_at) = CURRENT_DATE
    -- Genres is either NULL or empty array
    AND (
        genres IS NULL 
        OR genres = '{}'::text[]
        OR array_length(genres, 1) IS NULL
        OR array_length(genres, 1) = 0
    )
ORDER BY created_at DESC;

-- Count version (uncomment to use):
-- SELECT COUNT(*) as artists_created_today_with_no_genres
-- FROM public.artists
-- WHERE 
--     DATE(created_at) = CURRENT_DATE
--     AND (
--         genres IS NULL 
--         OR genres = '{}'::text[]
--         OR array_length(genres, 1) IS NULL
--         OR array_length(genres, 1) = 0
--     );

