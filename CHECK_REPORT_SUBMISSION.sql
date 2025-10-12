-- Check if the report was submitted successfully
-- Run this in Supabase SQL Editor

-- 1. Check all moderation flags (reports)
SELECT 
    id,
    content_type,
    content_id,
    flag_reason,
    flag_details,
    flagged_by_user_id,
    status,
    created_at,
    updated_at
FROM moderation_flags 
ORDER BY created_at DESC 
LIMIT 10;

-- 2. Get details about the user who submitted the report
SELECT 
    mf.*,
    p.name as reporter_name,
    p.account_type as reporter_account_type
FROM moderation_flags mf
LEFT JOIN profiles p ON mf.flagged_by_user_id = p.user_id
ORDER BY mf.created_at DESC 
LIMIT 5;

-- 3. Check if there are any pending flags
SELECT 
    COUNT(*) as pending_count,
    content_type,
    status
FROM moderation_flags 
GROUP BY content_type, status
ORDER BY content_type, status;

-- 4. Check recent admin actions
SELECT 
    id,
    action_type,
    target_type,
    target_id,
    admin_user_id,
    details,
    created_at
FROM admin_actions 
ORDER BY created_at DESC 
LIMIT 5;
