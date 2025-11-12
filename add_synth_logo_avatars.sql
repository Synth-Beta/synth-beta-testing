-- Add Synth logo as default avatar for profiles without avatars
-- This fixes the recommendation system issue where profiles without avatars are hidden

-- Step 1: First, you need to upload the Synth logo to Supabase storage
-- Instructions:
-- 1. Go to Supabase Dashboard → Storage → profile-avatars bucket
-- 2. Create a folder called "default" (if it doesn't exist)
-- 3. Upload "/Logos/Main logo black background.png" to "default/synth-logo.png"
-- 4. Make sure it's publicly accessible
--
-- OR use this URL format (replace with actual path after upload):
-- https://glpiolbrafqikqhnseto.supabase.co/storage/v1/object/public/profile-avatars/default/synth-logo.png

-- Step 2: Update all profiles without avatars
-- Replace the URL below with the actual public URL from Step 1
UPDATE public.profiles
SET 
  avatar_url = 'https://glpiolbrafqikqhnseto.supabase.co/storage/v1/object/public/profile-avatars/default/synth-logo.png',
  is_public_profile = COALESCE(is_public_profile, true)  -- Ensure profiles are public
WHERE 
  (avatar_url IS NULL OR avatar_url = '' OR TRIM(avatar_url) = '');

-- Step 3: Verify the update
SELECT 
  user_id,
  name,
  avatar_url,
  is_public_profile,
  CASE 
    WHEN avatar_url IS NULL OR avatar_url = '' OR TRIM(avatar_url) = '' THEN 'STILL_NEEDS_AVATAR'
    WHEN avatar_url LIKE '%synth-logo%' THEN 'HAS_SYNTH_LOGO'
    ELSE 'HAS_CUSTOM_AVATAR'
  END as avatar_status
FROM public.profiles
ORDER BY name;

-- Step 4: Check which profiles are now visible for recommendations
-- This should show all profiles that meet the RLS visibility criteria
SELECT 
  p.user_id,
  p.name,
  p.avatar_url IS NOT NULL 
    AND p.avatar_url != '' 
    AND TRIM(p.avatar_url) != '' as has_avatar,
  p.is_public_profile,
  CASE 
    WHEN p.user_id = auth.uid() THEN 'OWN_PROFILE'
    WHEN EXISTS (
      SELECT 1 FROM public.friends f
      WHERE (f.user1_id = auth.uid() AND f.user2_id = p.user_id)
         OR (f.user2_id = auth.uid() AND f.user1_id = p.user_id)
    ) THEN 'FRIEND'
    WHEN (
      p.avatar_url IS NOT NULL 
      AND p.avatar_url != '' 
      AND TRIM(p.avatar_url) != ''
      AND p.is_public_profile = true
    ) THEN 'VISIBLE_TO_ALL'
    ELSE 'HIDDEN'
  END as visibility_status
FROM public.profiles p
WHERE p.user_id != auth.uid()
ORDER BY visibility_status, p.name;

