-- Fix profiles table to add missing account_type and other columns
-- Run this in Supabase SQL Editor

-- Step 1: Check current profiles table structure
SELECT 'Current profiles table structure:' as step;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- Step 2: Add missing columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'user' CHECK (account_type IN ('user', 'creator', 'business', 'admin')),
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'professional', 'enterprise')),
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_level TEXT DEFAULT 'none' CHECK (verification_level IN ('none', 'email', 'phone', 'identity', 'business')),
ADD COLUMN IF NOT EXISTS business_info JSONB DEFAULT NULL;

-- Step 3: Update your user to admin
UPDATE public.profiles 
SET 
    account_type = 'admin',
    updated_at = now()
WHERE user_id = auth.uid();

-- Step 4: Also update the specific user ID we know
UPDATE public.profiles 
SET 
    account_type = 'admin',
    updated_at = now()
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- Step 5: Verify the changes
SELECT 'Updated profiles table structure:' as step;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- Step 6: Check your user's account info
SELECT 'Your user account info:' as step;
SELECT 
    user_id,
    name,
    account_type,
    subscription_tier,
    verified,
    verification_level
FROM public.profiles 
WHERE user_id = auth.uid();

-- Step 7: Test the account type query
SELECT 'Testing account type query:' as step;
SELECT 
    account_type,
    subscription_tier,
    verified,
    verification_level,
    business_info
FROM public.profiles
WHERE user_id = auth.uid()
LIMIT 1;
