-- Direct test to see if we can access flags
-- Run this in Supabase SQL Editor

-- Test 1: Simple count
SELECT COUNT(*) as total_flags FROM moderation_flags;

-- Test 2: All flags regardless of status
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    flagged_by_user_id,
    created_at
FROM moderation_flags 
ORDER BY created_at DESC;

-- Test 3: Just pending flags
SELECT 
    id,
    content_type,
    flag_reason,
    flag_details,
    created_at
FROM moderation_flags 
WHERE flag_status = 'pending'
ORDER BY created_at DESC;

-- Test 4: Check if RLS is blocking access
-- This will show if RLS policies are preventing access
SET row_security = off;
SELECT COUNT(*) as flags_without_rls FROM moderation_flags;
SET row_security = on;
