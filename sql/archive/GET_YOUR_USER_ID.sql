-- ============================================
-- GET YOUR USER ID
-- ============================================
-- Run this first to get your user ID, then use it in other queries

-- Option 1: Get your user ID from auth.users (if you know your email)
SELECT 
  id as user_id,
  email,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- Option 2: Get your user ID from profiles (shows all users)
SELECT 
  user_id,
  name,
  email,
  account_type,
  created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 10;

-- Option 3: If you're currently logged in, use this in your browser console:
-- (async () => {
--   const { data: { user } } = await supabase.auth.getUser();
--   console.log('Your User ID:', user.id);
--   copy(user.id); // This copies it to clipboard
-- })();

