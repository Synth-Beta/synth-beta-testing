-- ============================================
-- CREATE TEST ACCOUNTS: TestBiz and TestCreator
-- ============================================
-- This script creates two test accounts with proper account types
-- Both accounts have password: test123
-- Emails are auto-validated (email_confirmed_at set)

-- IMPORTANT: This requires service_role permissions to insert into auth.users
-- Run this in Supabase SQL Editor with service_role access
-- Make sure the pgcrypto extension is enabled for password hashing

-- NOTE: Supabase auth.users table typically requires an email address.
-- If NULL email causes an error, change TestBiz email to a placeholder like 'testbiz@test.local'

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- STEP 1: Delete existing test accounts if they exist
-- ============================================
DO $$
DECLARE
  testbiz_user_id UUID;
  testcreator_user_id UUID;
BEGIN
  -- Find and delete TestBiz user if exists
  SELECT id INTO testbiz_user_id
  FROM auth.users
  WHERE email = 'testbiz@test.local'
     OR raw_user_meta_data->>'login' = 'TestBiz'
  LIMIT 1;
  
  IF testbiz_user_id IS NOT NULL THEN
    -- Delete from profiles first (due to foreign key)
    DELETE FROM public.profiles WHERE user_id = testbiz_user_id;
    DELETE FROM auth.users WHERE id = testbiz_user_id;
    RAISE NOTICE 'Deleted existing TestBiz account';
  END IF;
  
  -- Find and delete TestCreator user if exists
  SELECT id INTO testcreator_user_id
  FROM auth.users
  WHERE email = '123@email.com'
     OR raw_user_meta_data->>'login' = 'TestCreator'
  LIMIT 1;
  
  IF testcreator_user_id IS NOT NULL THEN
    -- Delete from profiles first (due to foreign key)
    DELETE FROM public.profiles WHERE user_id = testcreator_user_id;
    DELETE FROM auth.users WHERE id = testcreator_user_id;
    RAISE NOTICE 'Deleted existing TestCreator account';
  END IF;
END $$;

-- ============================================
-- STEP 2: Create TestBiz account (business type)
-- ============================================
DO $$
DECLARE
  testbiz_id UUID;
  encrypted_password TEXT;
  instance_id_val UUID;
BEGIN
  -- Get instance_id from existing user
  SELECT instance_id INTO instance_id_val FROM auth.users LIMIT 1;
  IF instance_id_val IS NULL THEN
    -- If no users exist, we need to get it from auth schema
    SELECT setting INTO instance_id_val FROM pg_settings WHERE name = 'app.settings.instance_id';
    IF instance_id_val IS NULL THEN
      -- Fallback: try to get from auth.instances
      SELECT id INTO instance_id_val FROM auth.instances LIMIT 1;
      IF instance_id_val IS NULL THEN
        RAISE EXCEPTION 'Cannot determine instance_id. Please ensure at least one user exists or set instance_id manually.';
      END IF;
    END IF;
  END IF;
  
  -- Generate UUID for the user
  testbiz_id := gen_random_uuid();
  
  -- Hash password: test123 using bcrypt (cost factor 10)
  encrypted_password := crypt('test123', gen_salt('bf', 10));
  
  -- Insert user into auth.users
  -- NOTE: Supabase auth.users requires an email (NOT NULL constraint)
  -- Using placeholder email 'testbiz@test.local' since NULL is not allowed
  -- The login field in raw_user_meta_data is 'TestBiz' which can be used for identification
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at
  ) VALUES (
    testbiz_id,
    instance_id_val,
    'authenticated',
    'authenticated',
    'testbiz@test.local', -- Placeholder email (NULL not allowed in Supabase auth.users)
    encrypted_password,
    NOW(), -- Email confirmed immediately (auto-validated)
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"login": "TestBiz", "name": "TestBiz"}'::jsonb,
    false,
    NOW(),
    NOW(),
    '',
    '',
    '',
    '',
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    false,
    NULL
  );
  
  -- Wait a moment for trigger to create profile
  PERFORM pg_sleep(0.3);
  
  -- Update profile with business account type
  UPDATE public.profiles
  SET 
    account_type = 'business',
    name = 'TestBiz',
    verification_level = 'email',
    verified = false,
    subscription_tier = 'free',
    updated_at = NOW()
  WHERE user_id = testbiz_id;
  
  -- If profile doesn't exist (trigger hasn't run), create it manually
  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      user_id,
      name,
      bio,
      account_type,
      verification_level,
      verified,
      subscription_tier,
      created_at,
      updated_at,
      last_active_at,
      is_public_profile
    ) VALUES (
      testbiz_id,
      'TestBiz',
      'Test business account for venues, promoters, and advertisers',
      'business',
      'email',
      false,
      'free',
      NOW(),
      NOW(),
      NOW(),
      true
    );
  END IF;
  
  RAISE NOTICE 'Created TestBiz account with ID: %', testbiz_id;
END $$;

-- ============================================
-- STEP 3: Create TestCreator account (creator type)
-- ============================================
DO $$
DECLARE
  testcreator_id UUID;
  encrypted_password TEXT;
  instance_id_val UUID;
BEGIN
  -- Get instance_id from existing user
  SELECT instance_id INTO instance_id_val FROM auth.users LIMIT 1;
  IF instance_id_val IS NULL THEN
    SELECT id INTO instance_id_val FROM auth.instances LIMIT 1;
    IF instance_id_val IS NULL THEN
      RAISE EXCEPTION 'Cannot determine instance_id';
    END IF;
  END IF;
  
  -- Generate UUID for the user
  testcreator_id := gen_random_uuid();
  
  -- Hash password: test123 using bcrypt
  encrypted_password := crypt('test123', gen_salt('bf', 10));
  
  -- Insert user into auth.users with 123@email.com as requested
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at
  ) VALUES (
    testcreator_id,
    instance_id_val,
    'authenticated',
    'authenticated',
    '123@email.com', -- 123@email.com as requested
    encrypted_password,
    NOW(), -- Email confirmed immediately (auto-validated)
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"login": "TestCreator", "name": "TestCreator"}'::jsonb,
    false,
    NOW(),
    NOW(),
    '',
    '',
    '',
    '',
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    false,
    NULL
  );
  
  -- Wait a moment for trigger to create profile
  PERFORM pg_sleep(0.3);
  
  -- Update profile with creator account type
  UPDATE public.profiles
  SET 
    account_type = 'creator',
    name = 'TestCreator',
    verification_level = 'email',
    verified = false,
    subscription_tier = 'free',
    updated_at = NOW()
  WHERE user_id = testcreator_id;
  
  -- If profile doesn't exist (trigger hasn't run), create it manually
  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      user_id,
      name,
      bio,
      account_type,
      verification_level,
      verified,
      subscription_tier,
      created_at,
      updated_at,
      last_active_at,
      is_public_profile
    ) VALUES (
      testcreator_id,
      'TestCreator',
      'Test creator account for artists and labels',
      'creator',
      'email',
      false,
      'free',
      NOW(),
      NOW(),
      NOW(),
      true
    );
  END IF;
  
  RAISE NOTICE 'Created TestCreator account with ID: %', testcreator_id;
END $$;

-- ============================================
-- STEP 4: Verify the accounts were created correctly
-- ============================================
-- Check TestBiz account
SELECT 
  'TestBiz Account' as account_name,
  u.id as user_id,
  u.email,
  u.email_confirmed_at,
  u.raw_user_meta_data->>'login' as login,
  p.name,
  p.account_type,
  p.verification_level,
  p.verified,
  p.subscription_tier
FROM auth.users u
JOIN public.profiles p ON p.user_id = u.id
WHERE u.raw_user_meta_data->>'login' = 'TestBiz';

-- Both accounts should now exist successfully

-- Check TestCreator account
SELECT 
  'TestCreator Account' as account_name,
  u.id as user_id,
  u.email,
  u.email_confirmed_at,
  u.raw_user_meta_data->>'login' as login,
  p.name,
  p.account_type,
  p.verification_level,
  p.verified,
  p.subscription_tier
FROM auth.users u
JOIN public.profiles p ON p.user_id = u.id
WHERE u.raw_user_meta_data->>'login' = 'TestCreator';

-- ============================================
-- SUMMARY
-- ============================================
-- TestBiz: 
--   - Login: TestBiz (stored in raw_user_meta_data->>'login')
--   - Email: testbiz@test.local (placeholder - NULL not allowed in Supabase)
--   - Password: test123
--   - Account Type: business
--   - Email: Confirmed (auto-validated via email_confirmed_at)
--
-- TestCreator:
--   - Login: TestCreator (stored in raw_user_meta_data->>'login')
--   - Email: 123@email.com (as requested)
--   - Password: test123
--   - Account Type: creator
--   - Email: Confirmed (auto-validated via email_confirmed_at)
--
-- Login Instructions:
--   - TestBiz: Use email 'testbiz@test.local' with password 'test123'
--   - TestCreator: Use email '123@email.com' with password 'test123'
--
-- Note: Supabase auth.users table requires an email address (NOT NULL constraint),
--       so TestBiz uses a placeholder email 'testbiz@test.local'. The login
--       identifier 'TestBiz' is stored in raw_user_meta_data and can be used
--       for display or custom authentication logic if needed.
