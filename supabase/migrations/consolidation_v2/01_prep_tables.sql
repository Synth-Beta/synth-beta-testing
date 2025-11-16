-- ============================================
-- CONSOLIDATION V2: PREPARE TABLES
-- ============================================
-- Add all necessary metadata columns to core tables for consolidation

DO $$
BEGIN
  RAISE NOTICE '=== CONSOLIDATION V2: PREPARING TABLES ===';
  RAISE NOTICE '';
END $$;

-- ============================================
-- 1. USERS TABLE - Add metadata columns
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '1. Adding metadata columns to users table...';
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS waitlist_signup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waitlist_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_actions_log JSONB DEFAULT '[]';

-- Create indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_users_waitlist_signup ON public.users(waitlist_signup_at) WHERE waitlist_signup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_permissions_metadata ON public.users USING GIN(permissions_metadata);
CREATE INDEX IF NOT EXISTS idx_users_admin_actions_log ON public.users USING GIN(admin_actions_log);

-- ============================================
-- 2. EVENTS TABLE - Add metadata columns
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '2. Adding metadata columns to events table...';
END $$;

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

-- ============================================
-- 3. USER_PREFERENCES TABLE - Add genre preferences
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '3. Adding genre_preferences column to user_preferences table...';
END $$;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS genre_preferences JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_user_preferences_genre_preferences ON public.user_preferences USING GIN(genre_preferences);

-- ============================================
-- 4. REVIEWS TABLE - Add moderation metadata
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '4. Adding moderation_metadata column to reviews table...';
END $$;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS moderation_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reviews_moderation_metadata ON public.reviews USING GIN(moderation_metadata);

-- ============================================
-- 5. COMMENTS TABLE - Add moderation metadata
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '5. Adding moderation_metadata column to comments table...';
END $$;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS moderation_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_comments_moderation_metadata ON public.comments USING GIN(moderation_metadata);

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
  users_cols_count INTEGER;
  events_cols_count INTEGER;
  preferences_cols_count INTEGER;
  reviews_cols_count INTEGER;
  comments_cols_count INTEGER;
  all_good BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICATION ===';
  
  -- Check users columns
  SELECT COUNT(*) INTO users_cols_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name IN ('permissions_metadata', 'waitlist_signup_at', 'waitlist_metadata', 'admin_actions_log');
  
  -- Check events columns
  SELECT COUNT(*) INTO events_cols_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name IN ('claim_metadata', 'group_metadata', 'promotion_metadata', 'ticket_metadata', 'monetization_metadata', 'media_urls');
  
  -- Check user_preferences columns
  SELECT COUNT(*) INTO preferences_cols_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'genre_preferences';
  
  -- Check reviews columns
  SELECT COUNT(*) INTO reviews_cols_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'moderation_metadata';
  
  -- Check comments columns
  SELECT COUNT(*) INTO comments_cols_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'comments' 
    AND column_name = 'moderation_metadata';
  
  all_good := (users_cols_count = 4 AND events_cols_count = 6 AND preferences_cols_count = 1 
               AND reviews_cols_count = 1 AND comments_cols_count = 1);
  
  RAISE NOTICE 'Users columns added: %/4', users_cols_count;
  RAISE NOTICE 'Events columns added: %/6', events_cols_count;
  RAISE NOTICE 'User_preferences columns added: %/1', preferences_cols_count;
  RAISE NOTICE 'Reviews columns added: %/1', reviews_cols_count;
  RAISE NOTICE 'Comments columns added: %/1', comments_cols_count;
  RAISE NOTICE '';
  
  IF all_good THEN
    RAISE NOTICE '✅ ALL COLUMNS ADDED SUCCESSFULLY';
  ELSE
    RAISE NOTICE '⚠️ WARNING: Some columns may be missing. Check output above.';
  END IF;
END $$;

-- Final verification query
SELECT 
  'Preparation Complete' as status,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = 'users' 
     AND column_name IN ('permissions_metadata', 'waitlist_signup_at', 'waitlist_metadata', 'admin_actions_log')) as users_columns,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = 'events' 
     AND column_name IN ('claim_metadata', 'group_metadata', 'promotion_metadata', 'ticket_metadata', 'monetization_metadata', 'media_urls')) as events_columns,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = 'user_preferences' 
     AND column_name = 'genre_preferences') as preferences_columns,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = 'reviews' 
     AND column_name = 'moderation_metadata') as reviews_columns,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = 'comments' 
     AND column_name = 'moderation_metadata') as comments_columns,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name IN ('permissions_metadata', 'waitlist_signup_at', 'waitlist_metadata', 'admin_actions_log')) = 4
     AND (SELECT COUNT(*) FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = 'events' 
            AND column_name IN ('claim_metadata', 'group_metadata', 'promotion_metadata', 'ticket_metadata', 'monetization_metadata', 'media_urls')) = 6
     AND (SELECT COUNT(*) FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = 'user_preferences' 
            AND column_name = 'genre_preferences') = 1
     AND (SELECT COUNT(*) FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = 'reviews' 
            AND column_name = 'moderation_metadata') = 1
     AND (SELECT COUNT(*) FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = 'comments' 
            AND column_name = 'moderation_metadata') = 1
    THEN 'SUCCESS ✅'
    ELSE 'CHECK REQUIRED ⚠️'
  END as verification_status;

