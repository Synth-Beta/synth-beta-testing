-- Test if connection functions exist and work
-- Run this to check if the connection degree functions are installed

-- Check if the function exists
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_name LIKE '%connection%' 
AND routine_schema = 'public';

-- Test the get_connection_info function (replace with actual user IDs)
-- This will fail if the function doesn't exist
SELECT * FROM get_connection_info(
    '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,  -- Replace with your user ID
    '690d27ae-d803-4ff5-a381-162f8863dd9b'::UUID   -- Replace with another user ID
);

-- If the above works, test with a few different user combinations
-- Replace these UUIDs with actual user IDs from your database

-- Test 1st degree (if users are friends)
SELECT 
    'Test 1st Degree' as test_type,
    * 
FROM get_connection_info(
    '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
    '690d27ae-d803-4ff5-a381-162f8863dd9b'::UUID
);

-- Test 2nd degree (friends of friends)
SELECT 
    'Test 2nd Degree' as test_type,
    * 
FROM get_connection_info(
    '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
    '249ffcb5-ec0f-45ed-86e5-8109a8fcb616'::UUID
);

-- If any of these queries fail with "function does not exist" error,
-- you need to run SIMPLIFIED_LINKEDIN_CONNECTIONS.sql first!
