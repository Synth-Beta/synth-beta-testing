-- Make your user an admin and fix RLS policies
-- Run this in Supabase SQL Editor

-- 1. First, check your current user ID
SELECT auth.uid() as your_user_id;

-- 2. Update your profile to be an admin (replace 'your_user_id_here' with your actual user ID from step 1)
UPDATE profiles 
SET account_type = 'admin' 
WHERE user_id = auth.uid();

-- 3. Verify the update worked
SELECT 
    user_id,
    name,
    account_type,
    email
FROM profiles 
WHERE user_id = auth.uid();

-- 4. Test if you can now access moderation flags
SELECT COUNT(*) as flags_count FROM moderation_flags;

-- 5. Test if you can access event claims
SELECT COUNT(*) as claims_count FROM event_claims;

-- 6. If the above queries work, you're good to go!
-- If they don't, we need to fix the RLS policies
