-- Debug query to check avatar_url values
-- Run this to see the actual avatar_url for each user

SELECT 
    user_id,
    name,
    avatar_url,
    LENGTH(avatar_url) as url_length,
    avatar_url IS NULL as is_null,
    avatar_url = '' as is_empty,
    TRIM(avatar_url) = '' as is_empty_after_trim,
    CASE 
        WHEN avatar_url IS NULL THEN 'NULL'
        WHEN avatar_url = '' THEN 'Empty string'
        WHEN TRIM(avatar_url) = '' THEN 'Whitespace only'
        ELSE 'Has value: ' || LEFT(avatar_url, 50) || '...'
    END as avatar_status
FROM public.profiles
ORDER BY name;

-- Specifically check Sam Loiterstein's profile
SELECT 
    user_id,
    name,
    avatar_url,
    LENGTH(avatar_url) as url_length,
    avatar_url IS NULL as is_null,
    avatar_url = '' as is_empty,
    TRIM(avatar_url) = '' as is_empty_after_trim,
    avatar_url LIKE 'https://%' as looks_like_url,
    CASE 
        WHEN avatar_url IS NULL THEN 'NULL'
        WHEN avatar_url = '' THEN 'Empty string'
        WHEN TRIM(avatar_url) = '' THEN 'Whitespace only'
        ELSE 'Has value: ' || avatar_url
    END as avatar_status
FROM public.profiles
WHERE name = 'Sam Loiterstein';

-- Check if there are any storage objects for Sam's avatar
SELECT 
    name,
    bucket_id,
    path_tokens,
    created_at
FROM storage.objects
WHERE bucket_id = 'profile-avatars'
AND path_tokens[1] = '349bda34-7878-4c10-9f86-ec5888e55571';
