-- Test report submission (run this AFTER creating the moderation system)
-- Run this in Supabase SQL Editor

-- 1. Get your user ID first
SELECT id as your_user_id, email FROM auth.users WHERE email = 'your_email@example.com';

-- 2. Create a test moderation flag (replace 'your_user_id_here' with your actual user ID)
INSERT INTO moderation_flags (
    content_type,
    content_id,
    flag_reason,
    flag_details,
    flagged_by_user_id
) VALUES (
    'review'::moderation_entity_type_enum,
    gen_random_uuid(), -- Replace with actual review ID if you have one
    'spam'::moderation_flag_type_enum,
    'This is a test report submission',
    'your_user_id_here' -- Replace with your actual user ID
);

-- 3. Check if the test report was created
SELECT 
    id,
    content_type,
    content_id,
    flag_reason,
    flag_details,
    flagged_by_user_id,
    flag_status,
    created_at
FROM moderation_flags 
WHERE flagged_by_user_id = 'your_user_id_here'
ORDER BY created_at DESC 
LIMIT 5;

-- 4. Check all pending flags
SELECT 
    id,
    content_type,
    content_id,
    flag_reason,
    flag_details,
    flag_status,
    created_at
FROM moderation_flags 
WHERE flag_status = 'pending'
ORDER BY created_at DESC;
