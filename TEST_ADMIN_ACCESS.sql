-- Test admin access to moderation flags
-- Run this in Supabase SQL Editor

-- 1. Check if you have admin account type
SELECT 
    user_id,
    name,
    account_type,
    email
FROM profiles 
WHERE account_type = 'admin';

-- 2. Check your current user ID
SELECT auth.uid() as current_user_id;

-- 3. Check if your user is an admin
SELECT 
    p.*,
    CASE 
        WHEN p.account_type = 'admin' THEN 'YES - You are an admin'
        ELSE 'NO - You are not an admin'
    END as admin_status
FROM profiles p
WHERE p.user_id = auth.uid();

-- 4. Test direct query to moderation_flags (this should work for admins)
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    created_at
FROM moderation_flags 
WHERE flag_status = 'pending'
ORDER BY created_at DESC;

-- 5. Check RLS policies on moderation_flags
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'moderation_flags';
