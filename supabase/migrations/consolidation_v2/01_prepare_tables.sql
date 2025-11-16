-- ============================================
-- CONSOLIDATION V2: PREPARE MAIN TABLES
-- ============================================
-- Step 1: Add all necessary metadata columns to core 15 tables
-- This prepares the tables to receive data from supporting tables

DO $$
BEGIN
  RAISE NOTICE '=== CONSOLIDATION V2: PREPARING MAIN TABLES ===';
  RAISE NOTICE '';
END $$;

-- ============================================
-- 1. USERS TABLE - Add metadata columns
-- ============================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS waitlist_signup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waitlist_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_actions_log JSONB DEFAULT '[]';

-- Create indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_users_waitlist_signup ON public.users(waitlist_signup_at) WHERE waitlist_signup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_permissions_metadata ON public.users USING GIN(permissions_metadata);
CREATE INDEX IF NOT EXISTS idx_users_admin_actions_log ON public.users USING GIN(admin_actions_log);

DO $$ BEGIN RAISE NOTICE '✅ Prepared users table'; END $$;

-- ============================================
-- 2. EVENTS TABLE - Add metadata columns
-- ============================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS claim_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS group_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS promotion_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ticket_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS monetization_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';

-- Create indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_events_claim_metadata ON public.events USING GIN(claim_metadata);
CREATE INDEX IF NOT EXISTS idx_events_group_metadata ON public.events USING GIN(group_metadata);
CREATE INDEX IF NOT EXISTS idx_events_promotion_metadata ON public.events USING GIN(promotion_metadata);
CREATE INDEX IF NOT EXISTS idx_events_ticket_metadata ON public.events USING GIN(ticket_metadata);
CREATE INDEX IF NOT EXISTS idx_events_monetization_metadata ON public.events USING GIN(monetization_metadata);
CREATE INDEX IF NOT EXISTS idx_events_media_urls ON public.events USING GIN(media_urls);

DO $$ BEGIN RAISE NOTICE '✅ Prepared events table'; END $$;

-- ============================================
-- 3. USER_PREFERENCES TABLE - Add genre preferences
-- ============================================
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS genre_preferences JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_user_preferences_genre_preferences ON public.user_preferences USING GIN(genre_preferences);

DO $$ BEGIN RAISE NOTICE '✅ Prepared user_preferences table'; END $$;

-- ============================================
-- 4. REVIEWS TABLE - Add moderation metadata
-- ============================================
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS moderation_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reviews_moderation_metadata ON public.reviews USING GIN(moderation_metadata);

DO $$ BEGIN RAISE NOTICE '✅ Prepared reviews table'; END $$;

-- ============================================
-- 5. COMMENTS TABLE - Add moderation metadata
-- ============================================
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS moderation_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_comments_moderation_metadata ON public.comments USING GIN(moderation_metadata);

DO $$ BEGIN RAISE NOTICE '✅ Prepared comments table'; END $$;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
  users_columns_count INTEGER;
  events_columns_count INTEGER;
  preferences_columns_count INTEGER;
  reviews_columns_count INTEGER;
  comments_columns_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICATION ===';
  
  -- Check users table columns
  SELECT COUNT(*) INTO users_columns_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name IN ('permissions_metadata', 'waitlist_signup_at', 'waitlist_metadata', 'admin_actions_log');
  
  -- Check events table columns
  SELECT COUNT(*) INTO events_columns_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name IN ('claim_metadata', 'group_metadata', 'promotion_metadata', 'ticket_metadata', 'monetization_metadata', 'media_urls');
  
  -- Check user_preferences table columns
  SELECT COUNT(*) INTO preferences_columns_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'genre_preferences';
  
  -- Check reviews table columns
  SELECT COUNT(*) INTO reviews_columns_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'moderation_metadata';
  
  -- Check comments table columns
  SELECT COUNT(*) INTO comments_columns_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'comments' 
    AND column_name = 'moderation_metadata';
  
  RAISE NOTICE 'users: %/4 metadata columns added', users_columns_count;
  RAISE NOTICE 'events: %/6 metadata columns added', events_columns_count;
  RAISE NOTICE 'user_preferences: %/1 metadata column added', preferences_columns_count;
  RAISE NOTICE 'reviews: %/1 metadata column added', reviews_columns_count;
  RAISE NOTICE 'comments: %/1 metadata column added', comments_columns_count;
  
  IF users_columns_count = 4 
     AND events_columns_count = 6 
     AND preferences_columns_count = 1 
     AND reviews_columns_count = 1 
     AND comments_columns_count = 1 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ ALL TABLES PREPARED SUCCESSFULLY';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⚠️ WARNING: Some columns may be missing';
  END IF;
END $$;

-- Final verification query
SELECT 
  'Table Preparation Status' as status,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' AND table_name = 'users' 
   AND column_name IN ('permissions_metadata', 'waitlist_signup_at', 'waitlist_metadata', 'admin_actions_log')) = 4 as users_ready,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' AND table_name = 'events' 
   AND column_name IN ('claim_metadata', 'group_metadata', 'promotion_metadata', 'ticket_metadata', 'monetization_metadata', 'media_urls')) = 6 as events_ready,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' AND table_name = 'user_preferences' 
   AND column_name = 'genre_preferences') = 1 as preferences_ready,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' AND table_name = 'reviews' 
   AND column_name = 'moderation_metadata') = 1 as reviews_ready,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' AND table_name = 'comments' 
   AND column_name = 'moderation_metadata') = 1 as comments_ready;

