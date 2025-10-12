-- Diagnostic script to identify why moderation flags aren't showing in dashboard
-- Run this in Supabase SQL Editor

-- Step 1: Check current user and admin status
SELECT 'Current user info:' as diagnostic_step;
SELECT 
    auth.uid() as current_user_id,
    p.name as user_name,
    p.account_type,
    p.user_id
FROM profiles p 
WHERE p.user_id = auth.uid();

-- Step 2: Check if there are any admin users
SELECT 'Admin users in system:' as diagnostic_step;
SELECT 
    user_id,
    name,
    account_type,
    created_at
FROM profiles 
WHERE account_type = 'admin'
ORDER BY created_at DESC;

-- Step 3: Check if the moderation flags exist
SELECT 'Moderation flags in database:' as diagnostic_step;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    flagged_by_user_id,
    created_at
FROM moderation_flags 
ORDER BY created_at DESC;

-- Step 4: Check pending flags specifically
SELECT 'Pending flags count:' as diagnostic_step;
SELECT COUNT(*) as pending_count FROM moderation_flags WHERE flag_status = 'pending';

-- Step 5: Test RLS by checking if current user can see flags
SELECT 'RLS test - flags visible to current user:' as diagnostic_step;
SELECT COUNT(*) as visible_flags FROM moderation_flags;

-- Step 6: Check if the specific flag from your data exists
SELECT 'Specific flag check:' as diagnostic_step;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    flag_details,
    created_at
FROM moderation_flags 
WHERE id = '789f225e-0fbe-4c32-814e-09a4d69b8386';

-- Step 7: Test the exact query the dashboard uses
SELECT 'Dashboard query test:' as diagnostic_step;
SELECT 
    mf.id,
    mf.content_type,
    mf.flag_reason,
    mf.flag_status,
    mf.flag_details,
    mf.created_at,
    p.name as flagger_name
FROM moderation_flags mf
LEFT JOIN profiles p ON p.user_id = mf.flagged_by_user_id
WHERE mf.flag_status = 'pending'
ORDER BY mf.created_at ASC;

-- Step 8: Check RLS policies on moderation_flags
SELECT 'RLS policies on moderation_flags:' as diagnostic_step;
SELECT 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies 
WHERE tablename = 'moderation_flags';
