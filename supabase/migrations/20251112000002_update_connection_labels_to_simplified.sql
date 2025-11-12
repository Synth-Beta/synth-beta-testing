-- Update get_connection_info function to use simplified connection labels
-- New labels: Friend, Mutual Friend, Mutual Friends +, Stranger

CREATE OR REPLACE FUNCTION public.get_connection_info(current_user_id UUID, target_user_id UUID)
RETURNS TABLE(
    degree INTEGER,
    label TEXT,
    color TEXT,
    mutual_friends_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    conn_degree INTEGER;
    mutual_count INTEGER := 0;
BEGIN
    -- Get connection degree
    conn_degree := public.get_connection_degree(current_user_id, target_user_id);
    
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
            WHEN conn_degree = 1 THEN 'Friend'
            WHEN conn_degree = 2 THEN 'Mutual Friend'
            WHEN conn_degree = 3 THEN 'Mutual Friends +'
            ELSE 'Stranger'
        END::TEXT AS label,
        CASE 
            WHEN conn_degree = 0 THEN 'blue'
            WHEN conn_degree = 1 THEN 'dark-green'
            WHEN conn_degree = 2 THEN 'light-green'
            WHEN conn_degree = 3 THEN 'yellow'
            ELSE 'red'
        END::TEXT AS color,
        mutual_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_connection_info(UUID, UUID) TO authenticated;

