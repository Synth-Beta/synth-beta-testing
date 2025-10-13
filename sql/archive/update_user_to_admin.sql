-- Update user to admin account type
-- Run this in Supabase SQL Editor

-- Step 1: Check current user's account info
SELECT 'Current user account info:' as step;
SELECT 
    user_id,
    name,
    account_type,
    subscription_tier,
    verified,
    verification_level
FROM public.profiles 
WHERE user_id = auth.uid();

-- Step 2: Update your user to admin
UPDATE public.profiles 
SET 
    account_type = 'admin',
    updated_at = now()
WHERE user_id = auth.uid();

-- Step 3: Also update the specific user ID we know
UPDATE public.profiles 
SET 
    account_type = 'admin',
    updated_at = now()
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- Step 4: Verify the update worked
SELECT 'Updated user account info:' as step;
SELECT 
    user_id,
    name,
    account_type,
    subscription_tier,
    verified,
    verification_level
FROM public.profiles 
WHERE user_id = auth.uid();

-- Step 5: Test the exact query the useAccountType hook uses
SELECT 'Testing useAccountType query:' as step;
SELECT 
    account_type,
    subscription_tier,
    verified,
    verification_level,
    business_info
FROM public.profiles
WHERE user_id = auth.uid()
LIMIT 1;
