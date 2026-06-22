-- ============================================
-- ADD USERNAME CHANGE TRACKING
-- ============================================
-- This migration adds tracking for username changes to enforce
-- rate limiting (once per 30 days).
-- 
-- Also creates indexes for username lookups and unique constraint
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: ADD last_username_change_at COLUMN
-- ============================================
-- Track when user last changed their username for rate limiting

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'last_username_change_at'
  ) THEN
    ALTER TABLE public.users 
    ADD COLUMN last_username_change_at TIMESTAMPTZ;
    
    RAISE NOTICE 'Added last_username_change_at column to users table';
  ELSE
    RAISE NOTICE 'Column last_username_change_at already exists';
  END IF;
END $$;

-- ============================================
-- STEP 2: CREATE INDEX FOR USERNAME LOOKUPS
-- ============================================
-- Partial index for faster username availability checks
-- Only indexes non-null usernames

CREATE INDEX IF NOT EXISTS idx_users_username 
ON public.users(username) 
WHERE username IS NOT NULL;

-- ============================================
-- STEP 3: ADD UNIQUE CONSTRAINT ON USERNAME
-- ============================================
-- Ensure username uniqueness (allows NULL until backfill completes)
-- Uses partial unique index to allow multiple NULLs

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique 
ON public.users(username) 
WHERE username IS NOT NULL;

COMMENT ON INDEX idx_users_username_unique IS 
'Unique constraint on username. Allows NULL until all users have usernames assigned.';

COMMIT;

