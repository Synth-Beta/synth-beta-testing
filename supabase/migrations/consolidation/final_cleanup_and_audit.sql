-- ============================================
-- FINAL CONSOLIDATION: CLEANUP AND AUDIT
-- ============================================
-- This script:
-- 1. Stashes any data gaps between old and new tables
-- 2. Audits consolidated tables to ensure they're working
-- 3. Drops all unused/consolidated tables
--
-- WARNING: This permanently deletes old tables. Only run after thorough verification.

-- ============================================
-- STEP 1: CREATE STASH TABLE FOR DATA GAPS
-- ============================================
-- Create a table to store any data that might be lost during consolidation

CREATE TABLE IF NOT EXISTS public.consolidation_data_stash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stash_type TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT,
  source_data JSONB NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stash_type ON public.consolidation_data_stash(stash_type);
CREATE INDEX IF NOT EXISTS idx_stash_source_table ON public.consolidation_data_stash(source_table);

-- ============================================
-- STEP 2: IDENTIFY AND STASH DATA GAPS
-- ============================================

-- 2.1: Stash any profiles that don't have corresponding users
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'profiles';
  
  IF orphan_count > 0 THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_data, reason)
    SELECT 
      'orphan_profile',
      'profiles',
      row_to_json(p.*)::JSONB,
      'Profile exists but may not have been migrated to users'
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_id = p.user_id
    );
  END IF;
END $$;

-- 2.2: Stash any jambase_events that don't have corresponding events
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'jambase_events';
  
  IF orphan_count > 0 THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_data, reason)
    SELECT 
      'orphan_event',
      'jambase_events',
      row_to_json(je.*)::JSONB,
      'Event exists in jambase_events but may not have been migrated to events'
    FROM public.jambase_events je
    WHERE NOT EXISTS (
      SELECT 1 FROM public.events e 
      WHERE e.id = je.id OR e.jambase_event_id = je.id::TEXT
    );
  END IF;
END $$;

-- 2.3: Stash any artist_follows that don't have corresponding follows
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'artist_follows';
  
  IF orphan_count > 0 THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_data, reason)
    SELECT 
      'orphan_follow',
      'artist_follows',
      row_to_json(af.*)::JSONB,
      'Artist follow exists but may not have been migrated to follows'
    FROM public.artist_follows af
    WHERE NOT EXISTS (
      SELECT 1 FROM public.follows f 
      WHERE f.user_id = af.user_id 
        AND f.followed_entity_type = 'artist' 
        AND f.followed_entity_id = af.artist_id
    );
  END IF;
END $$;

-- 2.4: Stash any friends that don't have corresponding user_relationships
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'friends';
  
  IF orphan_count > 0 THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_data, reason)
    SELECT 
      'orphan_friendship',
      'friends',
      row_to_json(f.*)::JSONB,
      'Friendship exists but may not have been migrated to user_relationships'
    FROM public.friends f
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_relationships ur 
      WHERE ur.user_id = f.user1_id 
        AND ur.related_user_id = f.user2_id 
        AND ur.relationship_type = 'friend'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.user_relationships ur 
      WHERE ur.user_id = f.user2_id 
        AND ur.related_user_id = f.user1_id 
        AND ur.relationship_type = 'friend'
    );
  END IF;
END $$;

-- 2.5: Stash any user_reviews that don't have corresponding reviews
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'user_reviews';
  
  IF orphan_count > 0 THEN
    INSERT INTO public.consolidation_data_stash (stash_type, source_table, source_data, reason)
    SELECT 
      'orphan_review',
      'user_reviews',
      row_to_json(ur.*)::JSONB,
      'Review exists but may not have been migrated to reviews'
    FROM public.user_reviews ur
    WHERE NOT EXISTS (
      SELECT 1 FROM public.reviews r 
      WHERE r.id = ur.id OR (r.user_id = ur.user_id AND r.event_id = ur.event_id)
    );
  END IF;
END $$;

-- ============================================
-- STEP 3: AUDIT CONSOLIDATED TABLES
-- ============================================

-- 3.1: Check if all consolidated tables exist and have data
DO $$
DECLARE
  tbl_name TEXT;
  tbl_exists BOOLEAN;
  row_cnt BIGINT;
  result_text TEXT := '';
BEGIN
  FOR tbl_name IN 
    SELECT unnest(ARRAY[
      'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
      'relationships', 'reviews', 'comments', 'engagements', 'interactions',
      'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
      'account_permissions', 'monetization_tracking', 'user_genre_preferences'
    ])
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl_name
    ) INTO tbl_exists;
    
    IF tbl_exists THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', tbl_name) INTO row_cnt;
      result_text := result_text || tbl_name || ': EXISTS (' || row_cnt || ' rows)' || E'\n';
    ELSE
      result_text := result_text || tbl_name || ': MISSING' || E'\n';
    END IF;
  END LOOP;
  
  RAISE NOTICE '%', '=== Consolidated Tables Audit ===' || E'\n' || result_text;
END $$;

-- 3.2: Audit row counts for each consolidated table (conditional)
-- Create temp table to store results (must be outside DO block)
CREATE TEMP TABLE IF NOT EXISTS audit_results (
  audit_type TEXT,
  table_name TEXT,
  row_count BIGINT,
  valid_rows BIGINT
);

DO $$
DECLARE
  result_rec RECORD;
  query_text TEXT;
BEGIN
  -- Clear existing results
  DELETE FROM audit_results;

  -- Audit each table if it exists
  FOR result_rec IN 
    SELECT unnest(ARRAY[
      'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
      'relationships', 'reviews', 'comments', 'engagements', 'interactions',
      'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
      'account_permissions', 'monetization_tracking', 'user_genre_preferences'
    ]) as tbl_name
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = result_rec.tbl_name
    ) THEN
      -- Build dynamic query based on table structure (with column existence checks)
      CASE result_rec.tbl_name
        WHEN 'users' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''users'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL) FROM public.users';
        WHEN 'events' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''events'', COUNT(*), COUNT(*) FILTER (WHERE id IS NOT NULL) FROM public.events';
        WHEN 'artists' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''artists'', COUNT(*), COUNT(*) FILTER (WHERE id IS NOT NULL) FROM public.artists';
        WHEN 'venues' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''venues'', COUNT(*), COUNT(*) FILTER (WHERE id IS NOT NULL) FROM public.venues';
        WHEN 'follows' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''follows'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL AND followed_entity_id IS NOT NULL) FROM public.follows';
        WHEN 'user_relationships' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''user_relationships'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL AND related_user_id IS NOT NULL) FROM public.user_relationships';
        WHEN 'relationships' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''relationships'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL AND related_entity_id IS NOT NULL) FROM public.relationships';
        WHEN 'reviews' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''reviews'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL) FROM public.reviews';
        WHEN 'comments' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''comments'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL) FROM public.comments';
        WHEN 'engagements' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''engagements'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL) FROM public.engagements';
        WHEN 'interactions' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''interactions'', COUNT(*) FILTER (WHERE user_id IS NOT NULL), COUNT(*) FROM public.interactions';
        WHEN 'analytics_daily' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''analytics_daily'', COUNT(*), COUNT(*) FILTER (WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL) FROM public.analytics_daily';
        WHEN 'user_preferences' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''user_preferences'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL) FROM public.user_preferences';
        WHEN 'chats' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''chats'', COUNT(*), COUNT(*) FILTER (WHERE id IS NOT NULL) FROM public.chats';
        WHEN 'messages' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''messages'', COUNT(*), COUNT(*) FILTER (WHERE id IS NOT NULL) FROM public.messages';
        WHEN 'notifications' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''notifications'', COUNT(*), COUNT(*) FILTER (WHERE id IS NOT NULL) FROM public.notifications';
        WHEN 'account_permissions' THEN
          -- account_permissions doesn't have user_id - it has account_type, permission_key
          -- Just count all rows
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''account_permissions'', COUNT(*), COUNT(*) FILTER (WHERE id IS NOT NULL) FROM public.account_permissions';
        WHEN 'monetization_tracking' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''monetization_tracking'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL) FROM public.monetization_tracking';
        WHEN 'user_genre_preferences' THEN
          query_text := 'INSERT INTO audit_results SELECT ''Row Count Audit'', ''user_genre_preferences'', COUNT(*), COUNT(*) FILTER (WHERE user_id IS NOT NULL) FROM public.user_genre_preferences';
      END CASE;
      
      -- Only execute if query_text was set
      IF query_text IS NOT NULL THEN
        EXECUTE query_text;
      END IF;
    END IF;
  END LOOP;

  -- Return results
  RAISE NOTICE '%', '=== Row Count Audit Results ===';
END $$;

-- Display results
SELECT * FROM audit_results ORDER BY table_name;

-- 3.3: Check foreign key integrity (conditional)
-- Create temp table to store results (must be outside DO block)
CREATE TEMP TABLE IF NOT EXISTS fk_audit_results (
  audit_type TEXT,
  relationship TEXT,
  orphaned_count BIGINT
);

DO $$
DECLARE
  query_text TEXT;
  orphan_count BIGINT;
BEGIN
  -- Clear existing results
  DELETE FROM fk_audit_results;

  -- Check users -> events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'created_by_user_id'
    ) THEN
      SELECT COUNT(*) INTO orphan_count
      FROM public.events e
      WHERE e.created_by_user_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = e.created_by_user_id);
      INSERT INTO fk_audit_results VALUES ('Foreign Key Audit', 'users -> events', orphan_count);
    END IF;
  END IF;

  -- Check users -> reviews
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') THEN
    SELECT COUNT(*) INTO orphan_count
    FROM public.reviews r
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = r.user_id);
    INSERT INTO fk_audit_results VALUES ('Foreign Key Audit', 'users -> reviews', orphan_count);
  END IF;

  -- Check events -> reviews
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'event_id'
    ) THEN
      -- Check event_id type and handle accordingly
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'reviews' 
          AND column_name = 'event_id' AND data_type = 'uuid'
      ) THEN
        -- event_id is UUID, compare directly
        SELECT COUNT(*) INTO orphan_count
        FROM public.reviews r
        WHERE r.event_id IS NOT NULL 
          AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = r.event_id::UUID);
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'reviews' 
          AND column_name = 'event_id' AND data_type = 'text'
      ) THEN
        -- event_id is TEXT, compare by casting
        SELECT COUNT(*) INTO orphan_count
        FROM public.reviews r
        WHERE r.event_id IS NOT NULL 
          AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id::TEXT = r.event_id);
      ELSE
        -- Try UUID first, then TEXT
        BEGIN
          SELECT COUNT(*) INTO orphan_count
          FROM public.reviews r
          WHERE r.event_id IS NOT NULL 
            AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = r.event_id::UUID);
        EXCEPTION WHEN OTHERS THEN
          SELECT COUNT(*) INTO orphan_count
          FROM public.reviews r
          WHERE r.event_id IS NOT NULL 
            AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id::TEXT = r.event_id);
        END;
      END IF;
      INSERT INTO fk_audit_results VALUES ('Foreign Key Audit', 'events -> reviews', orphan_count);
    END IF;
  END IF;

  -- Check users -> follows
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'follows') THEN
    SELECT COUNT(*) INTO orphan_count
    FROM public.follows f
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = f.user_id);
    INSERT INTO fk_audit_results VALUES ('Foreign Key Audit', 'users -> follows', orphan_count);
  END IF;

  RAISE NOTICE '%', '=== Foreign Key Audit Complete ===';
END $$;

-- Display results
SELECT * FROM fk_audit_results;

-- 3.4: Check for duplicate data (unique constraint violations) - conditional
-- Create temp table to store results (must be outside DO block)
CREATE TEMP TABLE IF NOT EXISTS duplicate_check_results (
  audit_type TEXT,
  table_name TEXT,
  duplicate_count BIGINT
);

DO $$
DECLARE
  query_text TEXT;
  dup_count BIGINT;
BEGIN
  -- Clear existing results
  DELETE FROM duplicate_check_results;

  -- Check follows for duplicates
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'follows') THEN
    SELECT COUNT(*) - COUNT(DISTINCT (user_id, followed_entity_type, followed_entity_id)) INTO dup_count
    FROM public.follows;
    INSERT INTO duplicate_check_results VALUES ('Duplicate Check', 'follows', dup_count);
  END IF;

  -- Check user_relationships for duplicates
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_relationships') THEN
    SELECT COUNT(*) - COUNT(DISTINCT (user_id, related_user_id, relationship_type)) INTO dup_count
    FROM public.user_relationships;
    INSERT INTO duplicate_check_results VALUES ('Duplicate Check', 'user_relationships', dup_count);
  END IF;

  -- Check relationships for duplicates
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'relationships') THEN
    SELECT COUNT(*) - COUNT(DISTINCT (user_id, related_entity_id, relationship_type)) INTO dup_count
    FROM public.relationships;
    INSERT INTO duplicate_check_results VALUES ('Duplicate Check', 'relationships', dup_count);
  END IF;

  RAISE NOTICE '%', '=== Duplicate Check Complete ===';
END $$;

-- Display results
SELECT * FROM duplicate_check_results;

-- ============================================
-- STEP 4: DROP UNUSED TABLES
-- ============================================

-- 4.1: Drop old consolidated tables
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.profiles_old CASCADE;
DROP TABLE IF EXISTS public.profiles_backup CASCADE;

DROP TABLE IF EXISTS public.jambase_events CASCADE;
DROP TABLE IF EXISTS public.jambase_events_old CASCADE;
DROP TABLE IF EXISTS public.jambase_events_backup CASCADE;

DROP TABLE IF EXISTS public.artist_profile CASCADE;
DROP TABLE IF EXISTS public.venue_profile CASCADE;
DROP TABLE IF EXISTS public.artists_old CASCADE;
DROP TABLE IF EXISTS public.venue_profile_old CASCADE;

-- 4.2: Drop old relationship tables
DROP TABLE IF EXISTS public.artist_follows CASCADE;
DROP TABLE IF EXISTS public.venue_follows CASCADE;
DROP TABLE IF EXISTS public.user_jambase_events CASCADE;
DROP TABLE IF EXISTS public.friends CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.user_blocks CASCADE;
DROP TABLE IF EXISTS public.user_swipes CASCADE;
DROP TABLE IF EXISTS public.event_interests CASCADE;

-- 4.3: Drop old content tables
DROP TABLE IF EXISTS public.user_reviews CASCADE;
DROP TABLE IF EXISTS public.user_reviews_old CASCADE;
DROP TABLE IF EXISTS public.user_event_reviews CASCADE;
DROP TABLE IF EXISTS public.event_comments CASCADE;
DROP TABLE IF EXISTS public.event_comments_old CASCADE;
DROP TABLE IF EXISTS public.review_comments CASCADE;
DROP TABLE IF EXISTS public.review_comments_old CASCADE;

-- 4.4: Drop old engagement tables
DROP TABLE IF EXISTS public.event_likes CASCADE;
DROP TABLE IF EXISTS public.event_likes_old CASCADE;
DROP TABLE IF EXISTS public.review_likes CASCADE;
DROP TABLE IF EXISTS public.review_likes_old CASCADE;
DROP TABLE IF EXISTS public.comment_likes CASCADE;
DROP TABLE IF EXISTS public.comment_likes_old CASCADE;
DROP TABLE IF EXISTS public.review_shares CASCADE;
DROP TABLE IF EXISTS public.review_shares_old CASCADE;

-- 4.5: Drop old analytics tables
DROP TABLE IF EXISTS public.analytics_user_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_user_daily_old CASCADE;
DROP TABLE IF EXISTS public.analytics_event_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_event_daily_old CASCADE;
DROP TABLE IF EXISTS public.analytics_artist_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_artist_daily_old CASCADE;
DROP TABLE IF EXISTS public.analytics_venue_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_venue_daily_old CASCADE;
DROP TABLE IF EXISTS public.analytics_campaign_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_campaign_daily_old CASCADE;

-- 4.6: Drop old preferences tables
DROP TABLE IF EXISTS public.streaming_profiles CASCADE;
DROP TABLE IF EXISTS public.streaming_profiles_old CASCADE;
DROP TABLE IF EXISTS public.user_streaming_stats_summary CASCADE;
DROP TABLE IF EXISTS public.user_streaming_stats_summary_old CASCADE;
DROP TABLE IF EXISTS public.user_music_taste CASCADE;
DROP TABLE IF EXISTS public.music_preference_signals CASCADE;
DROP TABLE IF EXISTS public.music_preference_signals_old CASCADE;
DROP TABLE IF EXISTS public.user_recommendations_cache CASCADE;
DROP TABLE IF EXISTS public.user_recommendations_cache_old CASCADE;

-- 4.7: Drop old genre interaction tables
DROP TABLE IF EXISTS public.user_genre_interactions CASCADE;
DROP TABLE IF EXISTS public.user_artist_interactions CASCADE;
DROP TABLE IF EXISTS public.user_song_interactions CASCADE;
DROP TABLE IF EXISTS public.user_venue_interactions CASCADE;

-- 4.8: Drop legacy tables
DROP TABLE IF EXISTS public.user_artists CASCADE;
DROP TABLE IF EXISTS public.user_venues CASCADE;
DROP TABLE IF EXISTS public.user_events CASCADE;

-- 4.9: Drop migration temporary tables
DROP TABLE IF EXISTS public.users_new CASCADE;
DROP TABLE IF EXISTS public.events_new CASCADE;
DROP TABLE IF EXISTS public.artists_new CASCADE;
DROP TABLE IF EXISTS public.venues_new CASCADE;
DROP TABLE IF EXISTS public.relationships_new CASCADE;
DROP TABLE IF EXISTS public.reviews_new CASCADE;
DROP TABLE IF EXISTS public.comments_new CASCADE;
DROP TABLE IF EXISTS public.engagements_new CASCADE;
DROP TABLE IF EXISTS public.interactions_new CASCADE;
DROP TABLE IF EXISTS public.analytics_daily_new CASCADE;
DROP TABLE IF EXISTS public.user_preferences_new CASCADE;
DROP TABLE IF EXISTS public.relationships_old CASCADE;
DROP TABLE IF EXISTS public.friends_old CASCADE;
DROP TABLE IF EXISTS public.matches_old CASCADE;
DROP TABLE IF EXISTS public.artist_follows_old CASCADE;
DROP TABLE IF EXISTS public.venue_follows_old CASCADE;

-- ============================================
-- STEP 5: FINAL VERIFICATION
-- ============================================

-- 5.1: Summary of stashed data
SELECT 
  'Data Stash Summary' as summary_type,
  stash_type,
  COUNT(*) as stash_count
FROM public.consolidation_data_stash
GROUP BY stash_type;

-- 5.2: Verify old tables are dropped
SELECT 
  'Dropped Tables Verification' as verification_type,
  COUNT(*) FILTER (WHERE table_name IN (
    'profiles', 'jambase_events', 'artist_profile', 'venue_profile',
    'artist_follows', 'venue_follows', 'user_jambase_events', 'friends',
    'friend_requests', 'matches', 'user_reviews', 'event_comments',
    'review_comments', 'event_likes', 'review_likes', 'comment_likes',
    'review_shares', 'user_interactions', 'analytics_user_daily',
    'analytics_event_daily', 'analytics_artist_daily', 'analytics_venue_daily',
    'analytics_campaign_daily', 'streaming_profiles', 'music_preference_signals',
    'user_recommendations_cache'
  )) as old_tables_remaining,
  COUNT(*) FILTER (WHERE table_name IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences'
  )) as consolidated_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- 5.3: Final consolidated table count
SELECT 
  'Final Table Count' as summary_type,
  COUNT(*) FILTER (WHERE table_name IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )) as total_consolidated_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

COMMENT ON TABLE public.consolidation_data_stash IS 
'Stores data that might have been lost during consolidation. Review before permanent deletion.';

