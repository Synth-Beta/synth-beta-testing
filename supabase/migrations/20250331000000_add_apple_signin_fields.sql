-- ============================================
-- ADD APPLE SIGN IN FIELDS TO USERS TABLE
-- ============================================
-- This migration adds Apple Sign In support by adding:
-- - apple_user_id: Unique identifier from Apple (sub claim)
-- - email: Email provided by Apple identity provider (metadata only, not unique)
--
-- These fields support iOS-only Sign in with Apple authentication.
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: ADD apple_user_id COLUMN
-- ============================================
-- This is the unique identifier from Apple (the 'sub' claim in the identity token)
-- It is the real identifier for Apple-authenticated users, not email

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'users'
      AND column_name = 'apple_user_id'
  ) THEN
    ALTER TABLE public.users
    ADD COLUMN apple_user_id TEXT;
    
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_user_id 
    ON public.users(apple_user_id) 
    WHERE apple_user_id IS NOT NULL;
    
    COMMENT ON COLUMN public.users.apple_user_id IS 
    'Apple Sign In user identifier (sub claim from identity token). Unique identifier for Apple-authenticated users. NULL for non-Apple users.';
    
    RAISE NOTICE '✅ Added apple_user_id column to users table';
  ELSE
    RAISE NOTICE '⚠️  apple_user_id column already exists, skipping';
  END IF;
END $$;

-- ============================================
-- STEP 2: ADD email COLUMN
-- ============================================
-- This email is identity metadata from Apple, not a login credential
-- May be null (Apple may only send email once on first sign-in)
-- Not unique (different users may share emails)
-- Not used for authentication

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'users'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE public.users
    ADD COLUMN email TEXT;
    
    COMMENT ON COLUMN public.users.email IS 
    'Email provided by identity provider (Apple). May be null or non-unique; not used for authentication. This is identity metadata only, not a login credential.';
    
    RAISE NOTICE '✅ Added email column to users table';
  ELSE
    RAISE NOTICE '⚠️  email column already exists, skipping';
  END IF;
END $$;

COMMIT;

