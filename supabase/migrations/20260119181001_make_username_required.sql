-- ============================================
-- MAKE USERNAME REQUIRED
-- ============================================
-- This migration makes username a required field and adds format validation.
-- 
-- ⚠️  CRITICAL: DO NOT RUN THIS MIGRATION UNTIL BACKFILL IS COMPLETE ⚠️
-- 
-- This migration will FAIL if any users still have NULL usernames.
-- You MUST run the backfill script first:
--   node scripts/backfill-usernames.mjs
-- 
-- After backfill completes successfully, then run this migration.
-- ============================================
-- 
-- Pre-flight check: Verify all users have usernames before running
-- 
-- To verify before running this migration:
-- SELECT COUNT(*) FROM public.users WHERE username IS NULL;
-- Should return 0
-- 
-- If you see an error like "9 users still have NULL username", you need to:
-- 1. Run: node scripts/backfill-usernames.mjs
-- 2. Verify: SELECT COUNT(*) FROM public.users WHERE username IS NULL; (should be 0)
-- 3. Then re-run this migration
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: VERIFY ALL USERS HAVE USERNAMES
-- ============================================
-- This will fail if any users still have NULL usernames

DO $$
DECLARE
  null_username_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_username_count
  FROM public.users
  WHERE username IS NULL;
  
  IF null_username_count > 0 THEN
    RAISE EXCEPTION 'Cannot make username required: % users still have NULL username. Run backfill script first.', null_username_count;
  END IF;
  
  RAISE NOTICE 'All users have usernames. Proceeding with making username required.';
END $$;

-- ============================================
-- STEP 2: MAKE USERNAME NOT NULL
-- ============================================

ALTER TABLE public.users 
ALTER COLUMN username SET NOT NULL;

-- ============================================
-- STEP 3: ADD FORMAT VALIDATION CONSTRAINT
-- ============================================
-- Ensure usernames match format: 3-30 chars, lowercase, alphanumeric + underscore/period

ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS username_format_check;

ALTER TABLE public.users
ADD CONSTRAINT username_format_check 
CHECK (username ~ '^[a-z0-9_.]{3,30}$');

COMMENT ON CONSTRAINT username_format_check ON public.users IS 
'Username must be 3-30 characters, lowercase letters, numbers, underscores, and periods only.';

COMMIT;

