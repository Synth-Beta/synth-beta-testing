-- CORRECTED LinkedIn-Style Connection Degrees for Synth
-- Based on actual Supabase schema audit
-- Uses proper table aliases to avoid ambiguous column references

-- ============================================================================
-- Drop existing functions to recreate them correctly
-- ============================================================================
DROP FUNCTION IF EXISTS get_first_degree_connections(UUID);
DROP FUNCTION IF EXISTS get_second_degree_connections(UUID);
DROP FUNCTION IF EXISTS get_third_degree_connections(UUID);
DROP FUNCTION IF EXISTS get_connection_degree(UUID, UUID);
DROP FUNCTION IF EXISTS get_connection_info(UUID, UUID);

-- ============================================================================
-- 1st Degree Connections (Direct Friends)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_first_degree_connections(target_user_id UUID)
RETURNS TABLE(
    connected_user_id UUID, 
    name VARCHAR, 
    avatar_url TEXT,
    last_active_at TIMESTAMPTZ,
    is_public_profile BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        CASE 
            WHEN f.user1_id = target_user_id THEN f.user2_id 
            ELSE f.user1_id 
        END AS connected_user_id,
        p.name,
        p.avatar_url,
        p.last_active_at,
        p.is_public_profile
    FROM public.friends f
    JOIN public.profiles p ON p.user_id = CASE 
        WHEN f.user1_id = target_user_id THEN f.user2_id 
        ELSE f.user1_id 
    END
    WHERE f.user1_id = target_user_id OR f.user2_id = target_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2nd Degree Connections (Friends of Friends)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_second_degree_connections(target_user_id UUID)
RETURNS TABLE(
    connected_user_id UUID, 
    name VARCHAR, 
    avatar_url TEXT,
    last_active_at TIMESTAMPTZ,
    is_public_profile BOOLEAN,
    mutual_friends_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH first_degree AS (
        SELECT CASE 
            WHEN f.user1_id = target_user_id THEN f.user2_id 
            ELSE f.user1_id 
        END AS friend_user_id
        FROM public.friends f
        WHERE f.user1_id = target_user_id OR f.user2_id = target_user_id
    ),
    second_degree_raw AS (
        SELECT DISTINCT
            CASE 
                WHEN f2.user1_id = fd.friend_user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END AS connected_user_id
        FROM first_degree fd
        JOIN public.friends f2 ON fd.friend_user_id = f2.user1_id OR fd.friend_user_id = f2.user2_id
        WHERE 
            CASE 
                WHEN f2.user1_id = fd.friend_user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END != target_user_id
            AND CASE 
                WHEN f2.user1_id = fd.friend_user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END NOT IN (SELECT fd2.friend_user_id FROM first_degree fd2)
    )
    SELECT DISTINCT
        sd.connected_user_id,
        p.name,
        p.avatar_url,
        p.last_active_at,
        p.is_public_profile,
        (
            SELECT COUNT(DISTINCT fd.friend_user_id)
            FROM first_degree fd
            JOIN public.friends f ON (fd.friend_user_id = f.user1_id AND sd.connected_user_id = f.user2_id)
                           OR (fd.friend_user_id = f.user2_id AND sd.connected_user_id = f.user1_id)
        )::INTEGER AS mutual_friends_count
    FROM second_degree_raw sd
    JOIN public.profiles p ON p.user_id = sd.connected_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3rd Degree Connections (Friends of Friends of Friends)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_third_degree_connections(target_user_id UUID)
RETURNS TABLE(
    connected_user_id UUID, 
    name VARCHAR, 
    avatar_url TEXT,
    last_active_at TIMESTAMPTZ,
    is_public_profile BOOLEAN,
    mutual_friends_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH first_degree AS (
        SELECT CASE 
            WHEN f.user1_id = target_user_id THEN f.user2_id 
            ELSE f.user1_id 
        END AS friend_user_id
        FROM public.friends f
        WHERE f.user1_id = target_user_id OR f.user2_id = target_user_id
    ),
    second_degree AS (
        SELECT DISTINCT
            CASE 
                WHEN f2.user1_id = fd.friend_user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END AS connected_user_id
        FROM first_degree fd
        JOIN public.friends f2 ON fd.friend_user_id = f2.user1_id OR fd.friend_user_id = f2.user2_id
        WHERE 
            CASE 
                WHEN f2.user1_id = fd.friend_user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END != target_user_id
            AND CASE 
                WHEN f2.user1_id = fd.friend_user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END NOT IN (SELECT fd2.friend_user_id FROM first_degree fd2)
    ),
    third_degree_raw AS (
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
            END != target_user_id
            AND CASE 
                WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
                ELSE f3.user1_id 
            END NOT IN (SELECT fd.friend_user_id FROM first_degree fd)
            AND CASE 
                WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
                ELSE f3.user1_id 
            END NOT IN (SELECT sd2.connected_user_id FROM second_degree sd2)
    )
    SELECT DISTINCT
        td.connected_user_id,
        p.name,
        p.avatar_url,
        p.last_active_at,
        p.is_public_profile,
        (
            SELECT COUNT(DISTINCT fd.friend_user_id)
            FROM first_degree fd
            JOIN public.friends f ON (fd.friend_user_id = f.user1_id AND td.connected_user_id = f.user2_id)
                           OR (fd.friend_user_id = f.user2_id AND td.connected_user_id = f.user1_id)
        )::INTEGER AS mutual_friends_count
    FROM third_degree_raw td
    JOIN public.profiles p ON p.user_id = td.connected_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to get connection degree between two users (CORRECTED)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_connection_degree(current_user_id UUID, target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    degree INTEGER;
BEGIN
    -- Check if same user
    IF current_user_id = target_user_id THEN
        RETURN 0;
    END IF;
    
    -- Check 1st degree (direct friends)
    IF EXISTS (
        SELECT 1 FROM public.friends f
        WHERE (current_user_id = f.user1_id AND target_user_id = f.user2_id)
           OR (current_user_id = f.user2_id AND target_user_id = f.user1_id)
    ) THEN
        RETURN 1;
    END IF;
    
    -- Check 2nd degree (friends of friends)
    IF EXISTS (
        SELECT 1 FROM get_second_degree_connections(current_user_id) gsd
        WHERE gsd.connected_user_id = target_user_id
    ) THEN
        RETURN 2;
    END IF;
    
    -- Check 3rd degree (friends of friends of friends)
    IF EXISTS (
        SELECT 1 FROM get_third_degree_connections(current_user_id) gtd
        WHERE gtd.connected_user_id = target_user_id
    ) THEN
        RETURN 3;
    END IF;
    
    -- Otherwise, stranger (4+)
    RETURN 4;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to get connection degree with label and color (CORRECTED)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_connection_info(current_user_id UUID, target_user_id UUID)
RETURNS TABLE(
    degree INTEGER,
    label VARCHAR,
    color VARCHAR,
    mutual_friends_count INTEGER
) AS $$
DECLARE
    conn_degree INTEGER;
    mutual_count INTEGER := 0;
BEGIN
    conn_degree := get_connection_degree(current_user_id, target_user_id);
    
    -- Get mutual friends count for 2nd and 3rd degree
    IF conn_degree IN (2, 3) THEN
        SELECT COUNT(DISTINCT CASE 
            WHEN f1.user1_id = current_user_id THEN f1.user2_id 
            ELSE f1.user1_id 
        END)
        INTO mutual_count
        FROM public.friends f1
        JOIN public.friends f2 ON (
            (f1.user1_id = current_user_id AND f2.user1_id = target_user_id AND f1.user2_id = f2.user2_id)
            OR (f1.user1_id = current_user_id AND f2.user2_id = target_user_id AND f1.user2_id = f2.user1_id)
            OR (f1.user2_id = current_user_id AND f2.user1_id = target_user_id AND f1.user1_id = f2.user2_id)
            OR (f1.user2_id = current_user_id AND f2.user2_id = target_user_id AND f1.user1_id = f2.user1_id)
        )
        WHERE f1.user1_id = current_user_id OR f1.user2_id = current_user_id;
    END IF;
    
    RETURN QUERY
    SELECT 
        conn_degree,
        CASE 
            WHEN conn_degree = 0 THEN 'You'
            WHEN conn_degree = 1 THEN 'Friends'
            WHEN conn_degree = 2 THEN 'Mutual Friends'
            WHEN conn_degree = 3 THEN 'Extended Friends'
            ELSE 'Strangers'
        END::VARCHAR AS label,
        CASE 
            WHEN conn_degree = 0 THEN 'blue'
            WHEN conn_degree = 1 THEN 'dark-green'
            WHEN conn_degree = 2 THEN 'light-green'
            WHEN conn_degree = 3 THEN 'yellow'
            ELSE 'red'
        END::VARCHAR AS color,
        mutual_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grant Permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_first_degree_connections(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_second_degree_connections(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_third_degree_connections(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_connection_degree(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_connection_info(UUID, UUID) TO authenticated;

-- ============================================================================
-- Test the corrected functions
-- ============================================================================
SELECT 'Testing connection functions...' as status;

-- Test basic connection degree
SELECT 
    'Connection Degree Test' as test_name,
    get_connection_degree(
        '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
        '690d27ae-d803-4ff5-a381-162f8863dd9b'::UUID
    ) as degree;

-- Test full connection info
SELECT 
    'Connection Info Test' as test_name,
    *
FROM get_connection_info(
    '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
    '690d27ae-d803-4ff5-a381-162f8863dd9b'::UUID
);
