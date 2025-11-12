-- ============================================
-- FIX: Create TestBiz Account with Placeholder Email
-- ============================================
-- TestBiz creation likely failed because Supabase auth.users requires an email
-- This script creates TestBiz with a placeholder email (since NULL isn't allowed)
-- The account will still use "TestBiz" as the login identifier

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- Create TestBiz account (business type)
-- ============================================
DO $$
DECLARE
  testbiz_id UUID;
  encrypted_password TEXT;
  instance_id_val UUID;
BEGIN
  -- Check if TestBiz already exists
  SELECT id INTO testbiz_id
  FROM auth.users
  WHERE raw_user_meta_data->>'login' = 'TestBiz'
  LIMIT 1;
  
  IF testbiz_id IS NOT NULL THEN
    RAISE NOTICE 'TestBiz account already exists with ID: %', testbiz_id;
    RAISE NOTICE 'Deleting existing TestBiz account to recreate...';
    DELETE FROM public.profiles WHERE user_id = testbiz_id;
    DELETE FROM auth.users WHERE id = testbiz_id;
  END IF;
  
  -- Get instance_id from existing user
  SELECT instance_id INTO instance_id_val FROM auth.users LIMIT 1;
  IF instance_id_val IS NULL THEN
    SELECT id INTO instance_id_val FROM auth.instances LIMIT 1;
    IF instance_id_val IS NULL THEN
      RAISE EXCEPTION 'Cannot determine instance_id';
    END IF;
  END IF;
  
  -- Generate UUID for the user
  testbiz_id := gen_random_uuid();
  
  -- Hash password: test123 using bcrypt (cost factor 10)
  encrypted_password := crypt('test123', gen_salt('bf', 10));
  
  -- Insert user into auth.users with placeholder email
  -- Using testbiz@test.local as placeholder (clearly marked as test account)
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
    'testbiz@test.local', -- Placeholder email (NULL not allowed in Supabase)
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
  RAISE NOTICE 'Note: Using placeholder email testbiz@test.local (NULL email not allowed in Supabase)';
  RAISE NOTICE 'Login: TestBiz, Password: test123';
END $$;

-- ============================================
-- Verify TestBiz account was created
-- ============================================
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

-- ============================================
-- SUMMARY
-- ============================================
-- TestBiz Account Created:
--   - Login: TestBiz
--   - Email: testbiz@test.local (placeholder - NULL not allowed)
--   - Password: test123
--   - Account Type: business
--   - Email: Confirmed (auto-validated)
--
-- Note: To log in, you may need to use the email 'testbiz@test.local'
--       or configure your app to use the 'login' field from raw_user_meta_data
--       if your authentication supports that.

