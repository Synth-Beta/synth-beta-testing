-- Simple moderation check that doesn't require admin privileges
-- Run this in Supabase SQL Editor to diagnose the issue

-- Step 1: Check current user info
SELECT 'Current user info:' as step;
SELECT 
    auth.uid() as current_user_id,
    p.name as user_name,
    p.account_type,
    p.user_id
FROM profiles p 
WHERE p.user_id = auth.uid();

-- Step 2: Check if moderation_flags table exists and has data
SELECT 'Moderation flags table check:' as step;
SELECT 
    COUNT(*) as total_flags,
    COUNT(*) FILTER (WHERE flag_status = 'pending') as pending_flags,
    COUNT(*) FILTER (WHERE flag_status = 'dismissed') as dismissed_flags,
    COUNT(*) FILTER (WHERE flag_status = 'resolved') as resolved_flags
FROM moderation_flags;

-- Step 3: Show all flags regardless of status
SELECT 'All flags in database:' as step;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    flag_details,
    created_at
FROM moderation_flags 
ORDER BY created_at DESC;

-- Step 4: Check if the specific flags from your data exist
SELECT 'Specific flag check:' as step;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    flag_details,
    created_at
FROM moderation_flags 
WHERE id IN ('789f225e-0fbe-4c32-814e-09a4d69b8386', 'e9c1712e-87a1-4689-9120-e8ad36f3d61a');

-- Step 5: Check admin users
SELECT 'Admin users:' as step;
SELECT 
    user_id,
    name,
    account_type
FROM profiles 
WHERE account_type = 'admin';

-- Step 6: Check RLS policies on moderation_flags
SELECT 'RLS policies:' as step;
SELECT 
    policyname, 
    cmd, 
    qual
FROM pg_policies 
WHERE tablename = 'moderation_flags';

-- Step 7: Test if current user can see flags (this will show if RLS is blocking)
SELECT 'RLS test - can current user see flags:' as step;
SELECT COUNT(*) as visible_flags FROM moderation_flags;
