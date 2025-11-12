-- ============================================================
-- Simple Recommendation Test Queries
-- Run these to diagnose why recommendations aren't working
-- ============================================================
-- Replace 'YOUR_USER_ID_HERE' with your actual user UUID
-- ============================================================

-- 1. Check if user exists and get basic info
SELECT 
  'User Info' as test,
  user_id,
  name,
  created_at
FROM public.profiles 
WHERE user_id = 'YOUR_USER_ID_HERE'::uuid;

-- 2. Count your friends (1st degree)
SELECT 
  'Friends Count' as test,
  COUNT(*)::BIGINT as value
FROM public.friends f
WHERE f.user1_id = 'YOUR_USER_ID_HERE'::uuid 
   OR f.user2_id = 'YOUR_USER_ID_HERE'::uuid;

-- 3. List your friends
SELECT 
  'Your Friends' as test,
  CASE 
    WHEN f.user1_id = 'YOUR_USER_ID_HERE'::uuid THEN f.user2_id 
    ELSE f.user1_id 
  END as friend_id,
  p.name as friend_name
FROM public.friends f
LEFT JOIN public.profiles p ON p.user_id = CASE 
  WHEN f.user1_id = 'YOUR_USER_ID_HERE'::uuid THEN f.user2_id 
  ELSE f.user1_id 
END
WHERE f.user1_id = 'YOUR_USER_ID_HERE'::uuid 
   OR f.user2_id = 'YOUR_USER_ID_HERE'::uuid;

-- 4. Check for 2nd degree connections (friends of friends)
WITH your_friends AS (
  SELECT DISTINCT
    CASE 
      WHEN f.user1_id = 'YOUR_USER_ID_HERE'::uuid THEN f.user2_id 
      ELSE f.user1_id 
    END AS friend_id
  FROM public.friends f
  WHERE f.user1_id = 'YOUR_USER_ID_HERE'::uuid 
     OR f.user2_id = 'YOUR_USER_ID_HERE'::uuid
)
SELECT 
  'Second Degree Connections' as test,
  COUNT(DISTINCT
    CASE 
      WHEN f2.user1_id = yf.friend_id THEN f2.user2_id 
      ELSE f2.user1_id 
    END
  )::BIGINT as value
FROM your_friends yf
JOIN public.friends f2 ON yf.friend_id = f2.user1_id OR yf.friend_id = f2.user2_id
WHERE 
  CASE 
    WHEN f2.user1_id = yf.friend_id THEN f2.user2_id 
    ELSE f2.user1_id 
  END != 'YOUR_USER_ID_HERE'::uuid
  AND CASE 
    WHEN f2.user1_id = yf.friend_id THEN f2.user2_id 
    ELSE f2.user1_id 
  END NOT IN (SELECT friend_id FROM your_friends);

-- 5. Check excluded users (friends + pending requests)
SELECT 
  'Excluded Users' as test,
  COUNT(DISTINCT user_id)::BIGINT as value
FROM (
  SELECT DISTINCT
    CASE 
      WHEN f.user1_id = 'YOUR_USER_ID_HERE'::uuid THEN f.user2_id 
      ELSE f.user1_id 
    END AS user_id
  FROM public.friends f
  WHERE f.user1_id = 'YOUR_USER_ID_HERE'::uuid OR f.user2_id = 'YOUR_USER_ID_HERE'::uuid
  UNION
  SELECT DISTINCT
    CASE 
      WHEN fr.sender_id = 'YOUR_USER_ID_HERE'::uuid THEN fr.receiver_id
      ELSE fr.sender_id
    END AS user_id
  FROM public.friend_requests fr
  WHERE (fr.sender_id = 'YOUR_USER_ID_HERE'::uuid OR fr.receiver_id = 'YOUR_USER_ID_HERE'::uuid)
    AND fr.status = 'pending'
) excluded;

-- 6. Check total profiles (excluding yourself)
SELECT 
  'Total Profiles (excluding self)' as test,
  COUNT(*)::BIGINT as value
FROM public.profiles p
WHERE p.user_id != 'YOUR_USER_ID_HERE'::uuid;

-- 7. Check cached recommendations
SELECT 
  'Cached Recommendations' as test,
  COUNT(*)::BIGINT as value
FROM public.user_recommendations_cache
WHERE user_id = 'YOUR_USER_ID_HERE'::uuid;

-- 8. Try to manually calculate recommendations (this might take a while)
-- SELECT public.calculate_user_recommendations('YOUR_USER_ID_HERE'::uuid);

-- 9. After running #8, check if recommendations were created
-- SELECT * FROM public.get_user_recommendations('YOUR_USER_ID_HERE'::uuid, 10);

