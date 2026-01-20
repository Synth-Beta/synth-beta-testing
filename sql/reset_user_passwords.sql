-- ============================================
-- RESET PASSWORD FOR USER
-- ============================================
-- This script resets the password for user: 9299b21e-26f6-4a85-8140-7a945f652de7
-- Passwords are hashed (bcrypt), so original passwords cannot be retrieved
-- This script sets a NEW password that you can use to login
-- ============================================
-- 
-- IMPORTANT: Passwords in auth.users are HASHED, not encrypted.
-- This means the original passwords CANNOT be retrieved.
-- This script will SET a NEW password for this user.
-- ============================================

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id UUID := '9299b21e-26f6-4a85-8140-7a945f652de7';
  v_new_password TEXT := 'testpass123';  -- Change this to your desired password
  v_encrypted_password TEXT;
  v_email TEXT;
  v_username TEXT;
BEGIN
  -- Get user info for verification
  SELECT email, username INTO v_email, v_username
  FROM public.users
  WHERE user_id = v_user_id;
  
  -- Generate encrypted password using bcrypt
  v_encrypted_password := crypt(v_new_password, gen_salt('bf'));
  
  -- Reset password
  UPDATE auth.users
  SET 
    encrypted_password = v_encrypted_password,
    updated_at = NOW()
  WHERE id = v_user_id;
  
  IF FOUND THEN
    RAISE NOTICE '✅ Reset password for user:';
    RAISE NOTICE '   User ID: %', v_user_id;
    RAISE NOTICE '   Email: %', COALESCE(v_email, 'N/A');
    RAISE NOTICE '   Username: %', COALESCE(v_username, 'N/A');
    RAISE NOTICE '   NEW Password: %', v_new_password;
  ELSE
    RAISE WARNING '⚠️  User not found in auth.users: %', v_user_id;
  END IF;
END $$;

-- ============================================
-- VERIFY USER INFORMATION
-- ============================================
SELECT 
  u.id as auth_user_id,
  u.email as auth_email,
  p.user_id,
  p.name,
  p.username,
  p.email as profile_email,
  p.account_type
FROM auth.users u
LEFT JOIN public.users p ON u.id = p.user_id
WHERE u.id = '9299b21e-26f6-4a85-8140-7a945f652de7';

-- ============================================
-- NOTE ABOUT ORIGINAL PASSWORDS
-- ============================================
-- The original password for this user CANNOT be retrieved because:
-- 1. Passwords are hashed using bcrypt (one-way function)
-- 2. Hashing is irreversible - there is no way to "decrypt" them
-- 3. This is by design for security purposes
--
-- The script above has set a NEW password that you can use:
-- - User (9299b21e-26f6-4a85-8140-7a945f652de7): testpass123
--
-- You can change the password in the script above if needed.
