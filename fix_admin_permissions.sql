-- Fix admin permissions and moderation system
-- Run this in Supabase SQL Editor

-- Step 1: Check current user and set admin privileges
SELECT 'Setting admin privileges for current user:' as step;

-- First, check who you are
SELECT 
    auth.uid() as current_user_id,
    p.name as user_name,
    p.account_type as current_account_type
FROM profiles p 
WHERE p.user_id = auth.uid();

-- Update your account to admin if it's not already
UPDATE profiles 
SET 
    account_type = 'admin',
    updated_at = now()
WHERE user_id = auth.uid();

-- Verify the update
SELECT 
    auth.uid() as current_user_id,
    p.name as user_name,
    p.account_type as updated_account_type
FROM profiles p 
WHERE p.user_id = auth.uid();

-- Step 2: Also ensure the user who created the flags has admin privileges
UPDATE profiles 
SET 
    account_type = 'admin',
    updated_at = now()
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- Step 3: Check moderation flags
SELECT 'Moderation flags check:' as step;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    flag_details,
    created_at
FROM moderation_flags 
ORDER BY created_at DESC;

-- Step 4: Test the escalation statistics function now
SELECT 'Testing escalation statistics:' as step;
SELECT * FROM get_escalation_stats();

-- Step 5: Test the pending flags function
SELECT 'Testing pending flags:' as step;
SELECT COUNT(*) as pending_count FROM get_pending_moderation_flags();

-- Step 6: Show all escalated content
SELECT 'All escalated content:' as step;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    escalation_status,
    priority_level,
    created_at
FROM get_all_escalated_content()
ORDER BY 
    CASE priority_level
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
    END,
    created_at ASC;
