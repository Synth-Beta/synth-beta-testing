-- ============================================
-- CREATE DEVELOPER TEST USER
-- ============================================
-- This script creates a test user for development/testing purposes
-- Email: devtest@synth.app
-- Username: devtest
-- Password: devtest123
-- ============================================
-- 
-- IMPORTANT: This requires superuser/owner privileges in Supabase.
-- If this doesn't work, use the Supabase Dashboard:
-- 1. Go to Authentication > Users
-- 2. Click "Add User" > "Create new user"
-- 3. Email: devtest@synth.app
-- 4. Password: devtest123
-- 5. Auto Confirm User: ON
-- 6. Then run the "Step 2" section below to create the public.users record
-- ============================================

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Create auth user in auth.users table
-- Note: This requires superuser privileges or proper RLS policies
DO $$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT;
  v_instance_id UUID;
BEGIN
  -- Get the instance_id from an existing user (or use a default)
  SELECT COALESCE(
    (SELECT instance_id FROM auth.users LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::UUID
  ) INTO v_instance_id;
  
  -- Generate encrypted password using bcrypt
  v_encrypted_password := crypt('devtest123', gen_salt('bf'));
  
  -- Generate a UUID for the user
  v_user_id := gen_random_uuid();
  
  -- Insert into auth.users (Supabase structure)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    aud,
    role
  )
  VALUES (
    v_user_id,
    v_instance_id,
    'devtest@synth.app',
    v_encrypted_password,
    NOW(), -- Email confirmed immediately for testing
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "Dev Test User", "full_name": "Dev Test User"}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    '',
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_user_id;
  
  -- If user already exists, get the existing ID
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'devtest@synth.app';
  END IF;
  
  -- Step 2: Create public.users record
  -- The trigger should handle this, but we'll do it manually to ensure it works
  INSERT INTO public.users (
    user_id,
    name,
    username,
    email,
    account_type,
    is_public_profile,
    onboarding_completed,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    'Dev Test User',
    'devtest',
    'devtest@synth.app',
    'user',
    true,
    true, -- Skip onboarding for test user
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    name = EXCLUDED.name,
    username = EXCLUDED.username,
    email = EXCLUDED.email,
    updated_at = NOW();
  
  RAISE NOTICE '✅ Created test user:';
  RAISE NOTICE '   User ID: %', v_user_id;
  RAISE NOTICE '   Email: devtest@synth.app';
  RAISE NOTICE '   Username: devtest';
  RAISE NOTICE '   Password: devtest123';
END $$;

-- ============================================
-- ALTERNATIVE: If auth user was created via Dashboard
-- ============================================
-- If you created the auth user via Supabase Dashboard, run this to create the public.users record:
/*
INSERT INTO public.users (
  user_id,
  name,
  username,
  email,
  account_type,
  is_public_profile,
  onboarding_completed,
  created_at,
  updated_at
)
SELECT 
  id,
  'Dev Test User',
  'devtest',
  'devtest@synth.app',
  'user',
  true,
  true,
  NOW(),
  NOW()
FROM auth.users
WHERE email = 'devtest@synth.app'
ON CONFLICT (user_id) DO UPDATE
SET
  name = EXCLUDED.name,
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  updated_at = NOW();
*/

-- ============================================
-- VERIFY THE USER WAS CREATED
-- ============================================
SELECT 
  u.id as auth_user_id,
  u.email as auth_email,
  p.user_id,
  p.name,
  p.username,
  p.email as profile_email,
  p.account_type,
  p.onboarding_completed
FROM auth.users u
LEFT JOIN public.users p ON u.id = p.user_id
WHERE u.email = 'devtest@synth.app';
