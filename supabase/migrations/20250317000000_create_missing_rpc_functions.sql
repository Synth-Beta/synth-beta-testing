-- Create missing RPC functions that are causing 404 errors
-- ============================================================
-- Drop existing functions first to allow type changes
-- ============================================================

DROP FUNCTION IF EXISTS public.get_user_chats(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_first_degree_connections(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_second_degree_connections(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_third_degree_connections(UUID) CASCADE;

-- ============================================================
-- 1. get_user_chats - Returns user's chats with latest message info
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_chats(user_id UUID)
RETURNS TABLE (
    id UUID,
    chat_name TEXT,
    is_group_chat BOOLEAN,
    users UUID[],
    latest_message_id UUID,
    latest_message TEXT,
    latest_message_created_at TIMESTAMPTZ,
    latest_message_sender_name TEXT,
    group_admin_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.chat_name,
        c.is_group_chat,
        c.users,
        c.latest_message_id,
        COALESCE(m.content, '') as latest_message,
        m.created_at as latest_message_created_at,
        u.name as latest_message_sender_name,
        c.group_admin_id,
        c.created_at,
        c.updated_at
    FROM public.chats c
    LEFT JOIN public.messages m ON c.latest_message_id = m.id
    LEFT JOIN public.users u ON m.sender_id = u.user_id
    WHERE get_user_chats.user_id = ANY(c.users)
    ORDER BY c.updated_at DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_user_chats(UUID) TO anon, authenticated;

-- ============================================================
-- 2. get_first_degree_connections - Returns direct friends
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_first_degree_connections(target_user_id UUID)
RETURNS TABLE(
    connected_user_id UUID, 
    name TEXT, 
    avatar_url TEXT,
    last_active_at TIMESTAMPTZ,
    is_public_profile BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        CASE 
            WHEN f.user1_id = target_user_id THEN f.user2_id 
            ELSE f.user1_id 
        END AS connected_user_id,
        u.name,
        u.avatar_url,
        u.last_active_at,
        COALESCE(u.is_public_profile, true) as is_public_profile
    FROM public.friends f
    JOIN public.users u ON u.user_id = CASE 
        WHEN f.user1_id = target_user_id THEN f.user2_id 
        ELSE f.user1_id 
    END
    WHERE f.user1_id = target_user_id OR f.user2_id = target_user_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_first_degree_connections(UUID) TO authenticated;

-- ============================================================
-- 3. get_second_degree_connections - Returns friends of friends
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_second_degree_connections(target_user_id UUID)
RETURNS TABLE(
    connected_user_id UUID, 
    name TEXT, 
    avatar_url TEXT,
    last_active_at TIMESTAMPTZ,
    is_public_profile BOOLEAN,
    mutual_friends_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH first_degree AS (
        SELECT CASE 
            WHEN f.user1_id = target_user_id THEN f.user2_id 
            ELSE f.user1_id 
        END AS user_id
        FROM public.friends f
        WHERE f.user1_id = target_user_id OR f.user2_id = target_user_id
    ),
    second_degree_raw AS (
        SELECT DISTINCT
            CASE 
                WHEN f2.user1_id = fd.user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END AS user_id
        FROM first_degree fd
        JOIN public.friends f2 ON fd.user_id = f2.user1_id OR fd.user_id = f2.user2_id
        WHERE 
            CASE 
                WHEN f2.user1_id = fd.user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END != target_user_id
            AND CASE 
                WHEN f2.user1_id = fd.user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END NOT IN (SELECT user_id FROM first_degree)
    )
    SELECT DISTINCT
        sd.user_id AS connected_user_id,
        u.name,
        u.avatar_url,
        u.last_active_at,
        COALESCE(u.is_public_profile, true) as is_public_profile,
        (
            SELECT COUNT(DISTINCT fd.user_id)
            FROM first_degree fd
            JOIN public.friends f ON (fd.user_id = f.user1_id AND sd.user_id = f.user2_id)
                           OR (fd.user_id = f.user2_id AND sd.user_id = f.user1_id)
        )::INTEGER AS mutual_friends_count
    FROM second_degree_raw sd
    JOIN public.users u ON u.user_id = sd.user_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_second_degree_connections(UUID) TO authenticated;

-- ============================================================
-- 4. get_third_degree_connections - Returns friends of friends of friends
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_third_degree_connections(target_user_id UUID)
RETURNS TABLE(
    connected_user_id UUID, 
    name TEXT, 
    avatar_url TEXT,
    last_active_at TIMESTAMPTZ,
    is_public_profile BOOLEAN,
    mutual_friends_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH first_degree AS (
        SELECT CASE 
            WHEN f.user1_id = target_user_id THEN f.user2_id 
            ELSE f.user1_id 
        END AS user_id
        FROM public.friends f
        WHERE f.user1_id = target_user_id OR f.user2_id = target_user_id
    ),
    second_degree AS (
        SELECT DISTINCT
            CASE 
                WHEN f2.user1_id = fd.user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END AS user_id
        FROM first_degree fd
        JOIN public.friends f2 ON fd.user_id = f2.user1_id OR fd.user_id = f2.user2_id
        WHERE 
            CASE 
                WHEN f2.user1_id = fd.user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END != target_user_id
            AND CASE 
                WHEN f2.user1_id = fd.user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END NOT IN (SELECT user_id FROM first_degree)
    ),
    third_degree_raw AS (
        SELECT DISTINCT
            CASE 
                WHEN f3.user1_id = sd.user_id THEN f3.user2_id 
                ELSE f3.user1_id 
            END AS user_id
        FROM second_degree sd
        JOIN public.friends f3 ON sd.user_id = f3.user1_id OR sd.user_id = f3.user2_id
        WHERE 
            CASE 
                WHEN f3.user1_id = sd.user_id THEN f3.user2_id 
                ELSE f3.user1_id 
            END != target_user_id
            AND CASE 
                WHEN f3.user1_id = sd.user_id THEN f3.user2_id 
                ELSE f3.user1_id 
            END NOT IN (SELECT user_id FROM first_degree)
            AND CASE 
                WHEN f3.user1_id = sd.user_id THEN f3.user2_id 
                ELSE f3.user1_id 
            END NOT IN (SELECT user_id FROM second_degree)
    )
    SELECT DISTINCT
        td.user_id AS connected_user_id,
        u.name,
        u.avatar_url,
        u.last_active_at,
        COALESCE(u.is_public_profile, true) as is_public_profile,
        (
            SELECT COUNT(DISTINCT fd.user_id)
            FROM first_degree fd
            JOIN public.friends f ON (fd.user_id = f.user1_id AND td.user_id = f.user2_id)
                           OR (fd.user_id = f.user2_id AND td.user_id = f.user1_id)
        )::INTEGER AS mutual_friends_count
    FROM third_degree_raw td
    JOIN public.users u ON u.user_id = td.user_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_third_degree_connections(UUID) TO authenticated;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON FUNCTION public.get_user_chats(UUID) IS 'Returns all chats for a user with latest message information';
COMMENT ON FUNCTION public.get_first_degree_connections(UUID) IS 'Returns direct friends (1st degree connections)';
COMMENT ON FUNCTION public.get_second_degree_connections(UUID) IS 'Returns friends of friends (2nd degree connections) with mutual friends count';
COMMENT ON FUNCTION public.get_third_degree_connections(UUID) IS 'Returns friends of friends of friends (3rd degree connections) with mutual friends count';

