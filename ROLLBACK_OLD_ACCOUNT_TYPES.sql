-- ============================================
-- ROLLBACK OLD ACCOUNT TYPES SYSTEM
-- ============================================
-- Run this first to clean up the old 9-type system
-- Then run the new simplified migrations

-- Step 1: Drop the account_type column from profiles (if it exists)
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS account_type CASCADE;

-- Step 2: Drop other new columns that were added
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS verified CASCADE,
DROP COLUMN IF EXISTS verification_level CASCADE,
DROP COLUMN IF EXISTS business_info CASCADE,
DROP COLUMN IF EXISTS subscription_tier CASCADE,
DROP COLUMN IF EXISTS subscription_expires_at CASCADE,
DROP COLUMN IF EXISTS subscription_started_at CASCADE,
DROP COLUMN IF EXISTS stripe_customer_id CASCADE,
DROP COLUMN IF EXISTS stripe_subscription_id CASCADE;

-- Step 3: Drop the account_permissions table
DROP TABLE IF EXISTS public.account_permissions CASCADE;

-- Step 4: Drop all functions related to account types
DROP FUNCTION IF EXISTS public.user_has_permission(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_account_info(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.admin_set_account_type(UUID, account_type, verification_level, subscription_tier) CASCADE;
DROP FUNCTION IF EXISTS public.request_account_upgrade(account_type, JSONB) CASCADE;
DROP FUNCTION IF EXISTS set_verified_flag() CASCADE;

-- Step 5: Drop the view
DROP VIEW IF EXISTS public.profiles_with_account_info CASCADE;

-- Step 6: Drop the old enum types
DROP TYPE IF EXISTS account_type CASCADE;
DROP TYPE IF EXISTS subscription_tier CASCADE;
DROP TYPE IF EXISTS verification_level CASCADE;

-- Step 7: Restore notifications constraint to original (remove account-related notification types)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  'friend_request',
  'friend_accepted',
  'match',
  'message',
  'review_liked',
  'review_commented',
  'comment_replied',
  'event_interest',
  'artist_followed',
  'artist_new_event',
  'artist_profile_updated'
));

-- Verification
SELECT 
  'Old account types system removed' as status,
  NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') as enum_removed,
  NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'account_permissions') as table_removed,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'account_type'
  ) as column_removed;

