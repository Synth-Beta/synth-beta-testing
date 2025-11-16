-- ============================================
-- CONSOLIDATION V2: ADD METADATA COLUMNS
-- ============================================
-- Add JSONB metadata columns to core tables to support consolidation

DO $$
BEGIN
  RAISE NOTICE '=== ADDING METADATA COLUMNS TO CORE TABLES ===';
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

DO $$ BEGIN RAISE NOTICE '✅ Added metadata columns to users table'; END $$;

-- ============================================
-- 2. EVENTS TABLE - Add metadata columns
-- ============================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS claim_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS group_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS promotion_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ticket_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS monetization_metadata JSONB DEFAULT '{}';

-- Ensure media_urls exists (may already exist)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';

-- Create indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_events_claim_metadata ON public.events USING GIN(claim_metadata);
CREATE INDEX IF NOT EXISTS idx_events_group_metadata ON public.events USING GIN(group_metadata);
CREATE INDEX IF NOT EXISTS idx_events_promotion_metadata ON public.events USING GIN(promotion_metadata);
CREATE INDEX IF NOT EXISTS idx_events_ticket_metadata ON public.events USING GIN(ticket_metadata);
CREATE INDEX IF NOT EXISTS idx_events_monetization_metadata ON public.events USING GIN(monetization_metadata);
CREATE INDEX IF NOT EXISTS idx_events_media_urls ON public.events USING GIN(media_urls);

DO $$ BEGIN RAISE NOTICE '✅ Added metadata columns to events table'; END $$;

-- ============================================
-- 3. USER_PREFERENCES TABLE - Add genre preferences
-- ============================================
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS genre_preferences JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_user_preferences_genre_preferences ON public.user_preferences USING GIN(genre_preferences);

DO $$ BEGIN RAISE NOTICE '✅ Added genre_preferences column to user_preferences table'; END $$;

-- ============================================
-- 4. REVIEWS TABLE - Add moderation metadata
-- ============================================
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS moderation_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reviews_moderation_metadata ON public.reviews USING GIN(moderation_metadata);

DO $$ BEGIN RAISE NOTICE '✅ Added moderation_metadata column to reviews table'; END $$;

-- ============================================
-- 5. COMMENTS TABLE - Add moderation metadata
-- ============================================
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS moderation_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_comments_moderation_metadata ON public.comments USING GIN(moderation_metadata);

DO $$ BEGIN RAISE NOTICE '✅ Added moderation_metadata column to comments table'; END $$;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  'Metadata Columns Added' as status,
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
     AND column_name = 'moderation_metadata') as comments_columns;

