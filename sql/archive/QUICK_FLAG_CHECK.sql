-- Quick check for flags
-- Run this in Supabase SQL Editor

-- Check all flags
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    created_at
FROM moderation_flags 
ORDER BY created_at DESC;

-- Count by status
SELECT 
    flag_status,
    COUNT(*) as count
FROM moderation_flags 
GROUP BY flag_status;
