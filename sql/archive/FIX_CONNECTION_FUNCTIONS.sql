-- Fix ambiguous column reference in connection functions
-- The issue is that function parameters have the same names as table columns

-- Drop and recreate the functions with fixed column references

-- Function to get connection degree between two users (FIXED)
CREATE OR REPLACE FUNCTION get_connection_degree(user1_id UUID, user2_id UUID)
RETURNS INTEGER AS $$
DECLARE
    degree INTEGER;
BEGIN
    -- Check if same user
    IF user1_id = user2_id THEN
        RETURN 0;
    END IF;
    
    -- Check 1st degree (direct friends) - use aliases to avoid ambiguity
    IF EXISTS (
        SELECT 1 FROM friends f
        WHERE (user1_id = f.user1_id AND user2_id = f.user2_id)
           OR (user1_id = f.user2_id AND user2_id = f.user1_id)
    ) THEN
        RETURN 1;
    END IF;
    
    -- Check 2nd degree (friends of friends)
    IF EXISTS (
        SELECT 1 FROM get_second_degree_connections(user1_id) gsd
        WHERE gsd.connected_user_id = user2_id
    ) THEN
        RETURN 2;
    END IF;
    
    -- Check 3rd degree (friends of friends of friends)
    IF EXISTS (
        SELECT 1 FROM get_third_degree_connections(user1_id) gtd
        WHERE gtd.connected_user_id = user2_id
    ) THEN
        RETURN 3;
    END IF;
    
    -- Otherwise, stranger (4+)
    RETURN 4;
END;
$$ LANGUAGE plpgsql;

-- Function to get connection degree with label and color (FIXED)
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
    
    -- Get mutual friends count for 2nd and 3rd degree - use aliases to avoid ambiguity
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

-- Grant permissions again
GRANT EXECUTE ON FUNCTION get_connection_degree(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_connection_info(UUID, UUID) TO authenticated;

-- Test the fixed function
SELECT * FROM get_connection_info(
    '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
    '690d27ae-d803-4ff5-a381-162f8863dd9b'::UUID
);
