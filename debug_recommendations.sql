-- ============================================================
-- Debug Function for User Recommendations
-- Run this to troubleshoot why recommendations aren't showing
-- ============================================================

-- Create or replace the debug function
CREATE OR REPLACE FUNCTION public.debug_user_recommendations(p_user_id UUID)
RETURNS TABLE(
  metric TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH first_degree AS (
    SELECT COUNT(*)::BIGINT as count
    FROM public.friends f
    WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
  ),
  second_degree AS (
    WITH first_degree_ids AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS friend_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
    )
    SELECT COUNT(DISTINCT
      CASE 
        WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
        ELSE f2.user1_id 
      END
    )::BIGINT as count
    FROM first_degree_ids fd
    JOIN public.friends f2 ON fd.friend_id = f2.user1_id OR fd.friend_id = f2.user2_id
    WHERE 
      CASE 
        WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
        ELSE f2.user1_id 
      END != p_user_id
      AND CASE 
        WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
        ELSE f2.user1_id 
      END NOT IN (SELECT friend_id FROM first_degree_ids)
  ),
  third_degree AS (
    WITH first_degree_ids AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS friend_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
    ),
    second_degree_ids AS (
      SELECT DISTINCT
        CASE 
          WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END AS friend_id
      FROM first_degree_ids fd
      JOIN public.friends f2 ON fd.friend_id = f2.user1_id OR fd.friend_id = f2.user2_id
      WHERE 
        CASE 
          WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END != p_user_id
        AND CASE 
          WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END NOT IN (SELECT friend_id FROM first_degree_ids)
    )
    SELECT COUNT(DISTINCT
      CASE 
        WHEN f3.user1_id = sd.friend_id THEN f3.user2_id 
        ELSE f3.user1_id 
      END
    )::BIGINT as count
    FROM second_degree_ids sd
    JOIN public.friends f3 ON sd.friend_id = f3.user1_id OR sd.friend_id = f3.user2_id
    WHERE 
      CASE 
        WHEN f3.user1_id = sd.friend_id THEN f3.user2_id 
        ELSE f3.user1_id 
      END != p_user_id
      AND CASE 
        WHEN f3.user1_id = sd.friend_id THEN f3.user2_id 
        ELSE f3.user1_id 
      END NOT IN (SELECT friend_id FROM first_degree_ids)
      AND CASE 
        WHEN f3.user1_id = sd.friend_id THEN f3.user2_id 
        ELSE f3.user1_id 
      END NOT IN (SELECT friend_id FROM second_degree_ids)
  ),
  excluded_count AS (
    SELECT COUNT(*)::BIGINT as count
    FROM (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS user_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
      UNION
      SELECT DISTINCT
        CASE 
          WHEN fr.sender_id = p_user_id THEN fr.receiver_id
          ELSE fr.sender_id
        END AS user_id
      FROM public.friend_requests fr
      WHERE (fr.sender_id = p_user_id OR fr.receiver_id = p_user_id)
        AND fr.status = 'pending'
    ) excluded
  ),
  candidate_count AS (
    WITH first_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS connected_user_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
    ),
    second_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END AS connected_user_id
      FROM first_degree fd
      JOIN public.friends f2 ON fd.connected_user_id = f2.user1_id OR fd.connected_user_id = f2.user2_id
      WHERE 
        CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END != p_user_id
        AND CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END NOT IN (SELECT connected_user_id FROM first_degree)
    ),
    third_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END AS connected_user_id
      FROM second_degree sd
      JOIN public.friends f3 ON sd.connected_user_id = f3.user1_id OR sd.connected_user_id = f3.user2_id
      WHERE 
        CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END != p_user_id
        AND CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END NOT IN (SELECT connected_user_id FROM first_degree)
        AND CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END NOT IN (SELECT connected_user_id FROM second_degree)
    ),
    all_connections AS (
      SELECT connected_user_id, 2 as degree FROM second_degree
      UNION
      SELECT connected_user_id, 3 as degree FROM third_degree
    ),
    excluded_users AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS user_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
      UNION
      SELECT DISTINCT
        CASE 
          WHEN fr.sender_id = p_user_id THEN fr.receiver_id
          ELSE fr.sender_id
        END AS user_id
      FROM public.friend_requests fr
      WHERE (fr.sender_id = p_user_id OR fr.receiver_id = p_user_id)
        AND fr.status = 'pending'
    )
    SELECT COUNT(*)::BIGINT as count
    FROM all_connections ac
    WHERE ac.connected_user_id NOT IN (SELECT user_id FROM excluded_users)
  ),
  total_profiles AS (
    SELECT COUNT(*)::BIGINT as count
    FROM public.profiles p
    WHERE p.user_id != p_user_id
  ),
  cached_count AS (
    SELECT COUNT(*)::BIGINT as count
    FROM public.user_recommendations_cache
    WHERE user_id = p_user_id
  )
  SELECT 'First Degree Connections (Friends)'::TEXT as metric, COALESCE(fd.count, 0)::BIGINT as value FROM first_degree fd
  UNION ALL
  SELECT 'Second Degree Connections'::TEXT, COALESCE(sd.count, 0)::BIGINT FROM second_degree sd
  UNION ALL
  SELECT 'Third Degree Connections'::TEXT, COALESCE(td.count, 0)::BIGINT FROM third_degree td
  UNION ALL
  SELECT 'Excluded Users (Friends + Pending)'::TEXT, COALESCE(ec.count, 0)::BIGINT FROM excluded_count ec
  UNION ALL
  SELECT 'Candidate Users (2nd+3rd degree)'::TEXT, COALESCE(cc.count, 0)::BIGINT FROM candidate_count cc
  UNION ALL
  SELECT 'Total Profiles (excluding self)'::TEXT, COALESCE(tp.count, 0)::BIGINT FROM total_profiles tp
  UNION ALL
  SELECT 'Cached Recommendations'::TEXT, COALESCE(cac.count, 0)::BIGINT FROM cached_count cac;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_user_recommendations(UUID) TO authenticated;

-- ============================================================
-- USAGE:
-- ============================================================
-- Replace 'your-user-id-here' with your actual user UUID
--
-- SELECT * FROM public.debug_user_recommendations('your-user-id-here'::uuid);
--
-- This will show you:
-- - How many friends you have (1st degree)
-- - How many 2nd degree connections exist
-- - How many 3rd degree connections exist
-- - How many users are excluded (already friends or pending requests)
-- - How many candidate users were found
-- - Total profiles in the system
-- - How many recommendations are cached
--
-- ============================================================
-- SIMPLE TEST QUERIES (run these first to verify data exists):
-- ============================================================
-- 1. Check if you have any friends:
-- SELECT COUNT(*) as friend_count 
-- FROM public.friends f 
-- WHERE f.user1_id = 'your-user-id-here'::uuid OR f.user2_id = 'your-user-id-here'::uuid;
--
-- 2. Check total profiles:
-- SELECT COUNT(*) as total_profiles FROM public.profiles;
--
-- 3. Check if user exists:
-- SELECT user_id, name FROM public.profiles WHERE user_id = 'your-user-id-here'::uuid;
--
-- 4. Check cached recommendations:
-- SELECT COUNT(*) FROM public.user_recommendations_cache WHERE user_id = 'your-user-id-here'::uuid;
--
-- ============================================================
-- If you want to see actual candidate user IDs:
-- ============================================================
-- WITH first_degree AS (
--   SELECT DISTINCT
--     CASE 
--       WHEN f.user1_id = 'your-user-id-here'::uuid THEN f.user2_id 
--       ELSE f.user1_id 
--     END AS connected_user_id
--   FROM public.friends f
--   WHERE f.user1_id = 'your-user-id-here'::uuid OR f.user2_id = 'your-user-id-here'::uuid
-- ),
-- second_degree AS (
--   SELECT DISTINCT
--     CASE 
--       WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
--       ELSE f2.user1_id 
--     END AS connected_user_id
--   FROM first_degree fd
--   JOIN public.friends f2 ON fd.connected_user_id = f2.user1_id OR fd.connected_user_id = f2.user2_id
--   WHERE 
--     CASE 
--       WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
--       ELSE f2.user1_id 
--     END != 'your-user-id-here'::uuid
--     AND CASE 
--       WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
--       ELSE f2.user1_id 
--     END NOT IN (SELECT connected_user_id FROM first_degree)
-- ),
-- excluded_users AS (
--   SELECT DISTINCT
--     CASE 
--       WHEN f.user1_id = 'your-user-id-here'::uuid THEN f.user2_id 
--       ELSE f.user1_id 
--     END AS user_id
--   FROM public.friends f
--   WHERE f.user1_id = 'your-user-id-here'::uuid OR f.user2_id = 'your-user-id-here'::uuid
--   UNION
--   SELECT DISTINCT
--     CASE 
--       WHEN fr.sender_id = 'your-user-id-here'::uuid THEN fr.receiver_id
--       ELSE fr.sender_id
--     END AS user_id
--   FROM public.friend_requests fr
--   WHERE (fr.sender_id = 'your-user-id-here'::uuid OR fr.receiver_id = 'your-user-id-here'::uuid)
--     AND fr.status = 'pending'
-- )
-- SELECT 
--   sd.connected_user_id,
--   p.name,
--   p.avatar_url
-- FROM second_degree sd
-- LEFT JOIN public.profiles p ON p.user_id = sd.connected_user_id
-- WHERE sd.connected_user_id NOT IN (SELECT user_id FROM excluded_users)
-- LIMIT 20;

