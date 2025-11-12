-- Fix profile avatars for recommendations
-- Profiles without avatars are hidden from non-friends due to RLS policy
-- This script adds a default Synth logo avatar to profiles that don't have one

-- First, let's check which profiles need avatars
-- Run this to see the current state:
/*
SELECT 
  user_id,
  name,
  avatar_url,
  is_public_profile,
  CASE 
    WHEN avatar_url IS NULL OR avatar_url = '' OR TRIM(avatar_url) = '' THEN 'NEEDS_AVATAR'
    ELSE 'HAS_AVATAR'
  END as avatar_status
FROM public.profiles
WHERE user_id != auth.uid()  -- Exclude current user
ORDER BY name;
*/

-- Option 1: Use a placeholder/default avatar URL
-- You'll need to upload the Synth logo to Supabase storage first, then use its public URL
-- For now, we'll use a placeholder that you can replace

-- Step 1: Upload the logo to Supabase storage bucket 'profile-avatars' 
-- at path: 'default/synth-logo.png'
-- Then get its public URL and replace the placeholder below

-- Step 2: Update profiles without avatars
-- Replace 'YOUR_SUPABASE_URL' with your actual Supabase project URL
-- Replace 'YOUR_STORAGE_PATH' with the actual path after uploading the logo

-- For now, let's use a generic approach that constructs the URL
-- You'll need to replace these values:
-- 1. Upload /Logos/Main logo black background.png to Supabase storage
-- 2. Get the public URL from Supabase dashboard
-- 3. Update the UPDATE statement below with the actual URL

-- Example: If you upload to 'profile-avatars' bucket at 'default/synth-logo.png'
-- The URL would be: https://YOUR_PROJECT.supabase.co/storage/v1/object/public/profile-avatars/default/synth-logo.png

-- Update profiles without avatars to use the default logo
-- NOTE: Replace the placeholder URL with your actual Supabase storage public URL
UPDATE public.profiles
SET 
  avatar_url = 'https://YOUR_PROJECT.supabase.co/storage/v1/object/public/profile-avatars/default/synth-logo.png',
  is_public_profile = COALESCE(is_public_profile, true)  -- Ensure profiles are public
WHERE 
  (avatar_url IS NULL OR avatar_url = '' OR TRIM(avatar_url) = '')
  AND user_id != auth.uid();  -- Don't update current user's profile

-- Verify the update
SELECT 
  user_id,
  name,
  avatar_url,
  is_public_profile,
  CASE 
    WHEN avatar_url IS NULL OR avatar_url = '' OR TRIM(avatar_url) = '' THEN 'STILL_NEEDS_AVATAR'
    ELSE 'HAS_AVATAR'
  END as avatar_status
FROM public.profiles
WHERE user_id != auth.uid()
ORDER BY name;

-- Alternative: If you want to use a data URL or external URL instead
-- You can use a base64 encoded image or any public image URL
-- For example, if you have the logo hosted elsewhere:
-- UPDATE public.profiles
-- SET avatar_url = 'https://example.com/synth-logo.png'
-- WHERE (avatar_url IS NULL OR avatar_url = '' OR TRIM(avatar_url) = '');

