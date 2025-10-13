-- Simple check of user status
-- Run this in Supabase SQL Editor

-- Check if you're authenticated
SELECT 'Auth check:' as info, auth.uid() as user_id;

-- Check your profile data
SELECT 'Profile data:' as info, * FROM public.profiles WHERE user_id = auth.uid();

-- Check the specific user ID we know
SELECT 'Known user data:' as info, * FROM public.profiles WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- Update your account to admin (if not already)
UPDATE public.profiles 
SET account_type = 'admin' 
WHERE user_id = auth.uid();

-- Check if update worked
SELECT 'After update:' as info, account_type FROM public.profiles WHERE user_id = auth.uid();
