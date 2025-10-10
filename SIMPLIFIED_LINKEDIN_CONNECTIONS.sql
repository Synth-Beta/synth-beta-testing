-- Simplified LinkedIn-Style Connection Degrees for Synth
-- Uses existing friend_requests table, just adds degree calculation functions

-- ============================================================================
-- Connection Degree Functions (No new tables needed!)
-- ============================================================================

-- 1st Degree Connections (Direct Friends)
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
    FROM friends f
    JOIN profiles p ON p.user_id = CASE 
        WHEN f.user1_id = target_user_id THEN f.user2_id 
        ELSE f.user1_id 
    END
    WHERE f.user1_id = target_user_id OR f.user2_id = target_user_id;
END;
$$ LANGUAGE plpgsql;

-- 2nd Degree Connections (Friends of Friends)
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
            WHEN user1_id = target_user_id THEN user2_id 
            ELSE user1_id 
        END AS user_id
        FROM friends
        WHERE user1_id = target_user_id OR user2_id = target_user_id
    ),
    second_degree_raw AS (
        SELECT DISTINCT
            CASE 
                WHEN f2.user1_id = fd.user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END AS user_id
        FROM first_degree fd
        JOIN friends f2 ON fd.user_id = f2.user1_id OR fd.user_id = f2.user2_id
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
        p.name,
        p.avatar_url,
        p.last_active_at,
        p.is_public_profile,
        (
            SELECT COUNT(DISTINCT fd.user_id)
            FROM first_degree fd
            JOIN friends f ON (fd.user_id = f.user1_id AND sd.user_id = f.user2_id)
                           OR (fd.user_id = f.user2_id AND sd.user_id = f.user1_id)
        )::INTEGER AS mutual_friends_count
    FROM second_degree_raw sd
    JOIN profiles p ON p.user_id = sd.user_id;
END;
$$ LANGUAGE plpgsql;

-- 3rd Degree Connections (Friends of Friends of Friends)
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
            WHEN user1_id = target_user_id THEN user2_id 
            ELSE user1_id 
        END AS user_id
        FROM friends
        WHERE user1_id = target_user_id OR user2_id = target_user_id
    ),
    second_degree AS (
        SELECT DISTINCT
            CASE 
                WHEN f2.user1_id = fd.user_id THEN f2.user2_id 
                ELSE f2.user1_id 
            END AS user_id
        FROM first_degree fd
        JOIN friends f2 ON fd.user_id = f2.user1_id OR fd.user_id = f2.user2_id
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
        JOIN friends f3 ON sd.user_id = f3.user1_id OR sd.user_id = f3.user2_id
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
        p.name,
        p.avatar_url,
        p.last_active_at,
        p.is_public_profile,
        (
            SELECT COUNT(DISTINCT fd.user_id)
            FROM first_degree fd
            JOIN friends f ON (fd.user_id = f.user1_id AND td.user_id = f.user2_id)
                           OR (fd.user_id = f.user2_id AND td.user_id = f.user1_id)
        )::INTEGER AS mutual_friends_count
    FROM third_degree_raw td
    JOIN profiles p ON p.user_id = td.user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get connection degree between two users
CREATE OR REPLACE FUNCTION get_connection_degree(user1_id UUID, user2_id UUID)
RETURNS INTEGER AS $$
DECLARE
    degree INTEGER;
BEGIN
    -- Check if same user
    IF user1_id = user2_id THEN
        RETURN 0;
    END IF;
    
    -- Check 1st degree (direct friends)
    IF EXISTS (
        SELECT 1 FROM friends 
        WHERE (user1_id = friends.user1_id AND user2_id = friends.user2_id)
           OR (user1_id = friends.user2_id AND user2_id = friends.user1_id)
    ) THEN
        RETURN 1;
    END IF;
    
    -- Check 2nd degree (friends of friends)
    IF EXISTS (
        SELECT 1 FROM get_second_degree_connections(user1_id)
        WHERE connected_user_id = user2_id
    ) THEN
        RETURN 2;
    END IF;
    
    -- Check 3rd degree (friends of friends of friends)
    IF EXISTS (
        SELECT 1 FROM get_third_degree_connections(user1_id)
        WHERE connected_user_id = user2_id
    ) THEN
        RETURN 3;
    END IF;
    
    -- Otherwise, stranger (4+)
    RETURN 4;
END;
$$ LANGUAGE plpgsql;

-- Function to get connection degree with label and color
CREATE OR REPLACE FUNCTION get_connection_info(user1_id UUID, user2_id UUID)
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
    conn_degree := get_connection_degree(user1_id, user2_id);
    
    -- Get mutual friends count for 2nd and 3rd degree
    IF conn_degree IN (2, 3) THEN
        SELECT COUNT(DISTINCT CASE 
            WHEN f1.user1_id = user1_id THEN f1.user2_id 
            ELSE f1.user1_id 
        END)
        INTO mutual_count
        FROM friends f1
        JOIN friends f2 ON (
            (f1.user1_id = user1_id AND f2.user1_id = user2_id AND f1.user2_id = f2.user2_id)
            OR (f1.user1_id = user1_id AND f2.user2_id = user2_id AND f1.user2_id = f2.user1_id)
            OR (f1.user2_id = user1_id AND f2.user1_id = user2_id AND f1.user1_id = f2.user2_id)
            OR (f1.user2_id = user1_id AND f2.user2_id = user2_id AND f1.user1_id = f2.user1_id)
        )
        WHERE f1.user1_id = user1_id OR f1.user2_id = user1_id;
    END IF;
    
    RETURN QUERY
    SELECT 
        conn_degree,
        CASE 
            WHEN conn_degree = 0 THEN 'You'
            WHEN conn_degree = 1 THEN 'Friends'
            WHEN conn_degree = 2 THEN 'Friends of Friends'
            WHEN conn_degree = 3 THEN 'Mutual Friends of Mutual Friends'
            ELSE 'Stranger'
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
-- Test Queries
-- ============================================================================

-- Test connection degree between two users
-- SELECT * FROM get_connection_info('user1-id', 'user2-id');

-- Test getting all 2nd degree connections
-- SELECT * FROM get_second_degree_connections('your-user-id') 
-- ORDER BY mutual_friends_count DESC;
