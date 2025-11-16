-- ============================================
-- CONSOLIDATION V2: FIX LEGACY TABLES AND INDEXES
-- ============================================
-- This migration:
-- 1. Migrates friends table data to relationships
-- 2. Migrates friend_requests table data to relationships
-- 3. Adds missing GIN indexes for JSONB columns
-- 4. Creates compatibility views for backward compatibility
--
-- NOTE: This migration preserves legacy tables for now to allow
-- gradual migration of application code. Legacy tables can be
-- dropped after all code is migrated to use relationships table.

DO $$
BEGIN
  RAISE NOTICE '=== CONSOLIDATION V2: FIXING LEGACY TABLES AND INDEXES ===';
  RAISE NOTICE '';
END $$;

-- ============================================
-- 1. MIGRATE FRIENDS TABLE TO RELATIONSHIPS
-- ============================================
DO $$
DECLARE
  friends_count BIGINT;
  migrated_count BIGINT;
  friends_table_exists BOOLEAN;
BEGIN
  RAISE NOTICE '1. Migrating friends table to relationships...';
  
  -- Check if friends table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'friends'
  ) INTO friends_table_exists;
  
  IF NOT friends_table_exists THEN
    RAISE NOTICE '   ⚠️ friends table does not exist - skipping migration';
  ELSE
    -- Count existing friends
    SELECT COUNT(*) INTO friends_count
    FROM public.friends;
    
    RAISE NOTICE '   Found % friendships to migrate', friends_count;
    
    IF friends_count > 0 THEN
      -- Migrate friends to relationships (bilateral relationships)
      -- Create relationships for both directions: user1->user2 and user2->user1
      INSERT INTO public.relationships (
        user_id,
        related_entity_type,
        related_entity_id,
        relationship_type,
        status,
        metadata,
        created_at
      )
      SELECT 
        f.user1_id as user_id,
        'user' as related_entity_type,
        f.user2_id::TEXT as related_entity_id,
        'friend' as relationship_type,
        'accepted' as status,
        jsonb_build_object(
          'source_table', 'friends',
          'friend_id', f.id,
          'bilateral', true,
          'created_at', f.created_at
        ) as metadata,
        f.created_at
      FROM public.friends f
      WHERE NOT EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.user_id = f.user1_id
          AND r.related_entity_type = 'user'
          AND r.related_entity_id = f.user2_id::TEXT
          AND r.relationship_type = 'friend'
      )
      UNION ALL
      SELECT 
        f.user2_id as user_id,
        'user' as related_entity_type,
        f.user1_id::TEXT as related_entity_id,
        'friend' as relationship_type,
        'accepted' as status,
        jsonb_build_object(
          'source_table', 'friends',
          'friend_id', f.id,
          'bilateral', true,
          'created_at', f.created_at
        ) as metadata,
        f.created_at
      FROM public.friends f
      WHERE NOT EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.user_id = f.user2_id
          AND r.related_entity_type = 'user'
          AND r.related_entity_id = f.user1_id::TEXT
          AND r.relationship_type = 'friend'
      );
      
      GET DIAGNOSTICS migrated_count = ROW_COUNT;
      RAISE NOTICE '   ✅ Migrated % friendships to relationships (% bilateral relationships)', migrated_count, friends_count;
    ELSE
      RAISE NOTICE '   ⚠️ No friendships found to migrate';
    END IF;
  END IF;
END $$;

-- ============================================
-- 2. MIGRATE FRIEND_REQUESTS TABLE TO RELATIONSHIPS
-- ============================================
DO $$
DECLARE
  requests_count BIGINT;
  pending_count BIGINT;
  accepted_count BIGINT;
  declined_count BIGINT;
  migrated_count BIGINT;
  friend_requests_table_exists BOOLEAN;
BEGIN
  RAISE NOTICE '2. Migrating friend_requests table to relationships...';
  
  -- Check if friend_requests table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'friend_requests'
  ) INTO friend_requests_table_exists;
  
  IF NOT friend_requests_table_exists THEN
    RAISE NOTICE '   ⚠️ friend_requests table does not exist - skipping migration';
  ELSE
    -- Count existing friend requests
    SELECT COUNT(*) INTO requests_count
    FROM public.friend_requests;
    
    SELECT COUNT(*) INTO pending_count
    FROM public.friend_requests
    WHERE status = 'pending';
    
    SELECT COUNT(*) INTO accepted_count
    FROM public.friend_requests
    WHERE status = 'accepted';
    
    SELECT COUNT(*) INTO declined_count
    FROM public.friend_requests
    WHERE status = 'declined';
    
    RAISE NOTICE '   Found % friend requests: % pending, % accepted, % declined', 
      requests_count, pending_count, accepted_count, declined_count;
    
    IF requests_count > 0 THEN
      -- Migrate pending friend requests (bidirectional)
      INSERT INTO public.relationships (
        user_id,
        related_entity_type,
        related_entity_id,
        relationship_type,
        status,
        metadata,
        created_at
      )
      SELECT 
        fr.sender_id as user_id,
        'user' as related_entity_type,
        fr.receiver_id::TEXT as related_entity_id,
        'friend' as relationship_type,
        fr.status as status,
        jsonb_build_object(
          'source_table', 'friend_requests',
          'request_id', fr.id,
          'direction', 'sent',
          'created_at', fr.created_at,
          'updated_at', fr.updated_at
        ) as metadata,
        fr.created_at
      FROM public.friend_requests fr
      WHERE NOT EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.user_id = fr.sender_id
          AND r.related_entity_type = 'user'
          AND r.related_entity_id = fr.receiver_id::TEXT
          AND r.relationship_type = 'friend'
      )
      UNION ALL
      SELECT 
        fr.receiver_id as user_id,
        'user' as related_entity_type,
        fr.sender_id::TEXT as related_entity_id,
        'friend' as relationship_type,
        CASE 
          WHEN fr.status = 'pending' THEN 'pending'
          WHEN fr.status = 'accepted' THEN 'accepted'
          WHEN fr.status = 'declined' THEN 'declined'
          ELSE NULL
        END as status,
        jsonb_build_object(
          'source_table', 'friend_requests',
          'request_id', fr.id,
          'direction', 'received',
          'created_at', fr.created_at,
          'updated_at', fr.updated_at
        ) as metadata,
        fr.created_at
      FROM public.friend_requests fr
      WHERE NOT EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.user_id = fr.receiver_id
          AND r.related_entity_type = 'user'
          AND r.related_entity_id = fr.sender_id::TEXT
          AND r.relationship_type = 'friend'
      );
      
      GET DIAGNOSTICS migrated_count = ROW_COUNT;
      RAISE NOTICE '   ✅ Migrated % friend request relationships to relationships table', migrated_count;
    ELSE
      RAISE NOTICE '   ⚠️ No friend requests found to migrate';
    END IF;
  END IF;
END $$;

-- ============================================
-- 3. ADD MISSING GIN INDEXES FOR JSONB COLUMNS
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '3. Adding missing GIN indexes for JSONB columns...';
  
  -- Users table JSONB indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'users' 
      AND indexname = 'idx_users_permissions_metadata'
  ) THEN
    CREATE INDEX idx_users_permissions_metadata ON public.users USING GIN(permissions_metadata);
    RAISE NOTICE '   ✅ Created index: idx_users_permissions_metadata';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_users_permissions_metadata';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'users' 
      AND indexname = 'idx_users_admin_actions_log'
  ) THEN
    CREATE INDEX idx_users_admin_actions_log ON public.users USING GIN(admin_actions_log);
    RAISE NOTICE '   ✅ Created index: idx_users_admin_actions_log';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_users_admin_actions_log';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'users' 
      AND indexname = 'idx_users_waitlist_metadata'
  ) THEN
    CREATE INDEX idx_users_waitlist_metadata ON public.users USING GIN(waitlist_metadata);
    RAISE NOTICE '   ✅ Created index: idx_users_waitlist_metadata';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_users_waitlist_metadata';
  END IF;
  
  -- Events table JSONB indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'events' 
      AND indexname = 'idx_events_group_metadata'
  ) THEN
    CREATE INDEX idx_events_group_metadata ON public.events USING GIN(group_metadata);
    RAISE NOTICE '   ✅ Created index: idx_events_group_metadata';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_events_group_metadata';
  END IF;
  
  -- User preferences table JSONB indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'user_preferences' 
      AND indexname = 'idx_user_preferences_genre_preferences'
  ) THEN
    CREATE INDEX idx_user_preferences_genre_preferences ON public.user_preferences USING GIN(genre_preferences);
    RAISE NOTICE '   ✅ Created index: idx_user_preferences_genre_preferences';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_user_preferences_genre_preferences';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'user_preferences' 
      AND indexname = 'idx_user_preferences_notification_prefs'
  ) THEN
    CREATE INDEX idx_user_preferences_notification_prefs ON public.user_preferences USING GIN(notification_preferences);
    RAISE NOTICE '   ✅ Created index: idx_user_preferences_notification_prefs';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_user_preferences_notification_prefs';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'user_preferences' 
      AND indexname = 'idx_user_preferences_email_prefs'
  ) THEN
    CREATE INDEX idx_user_preferences_email_prefs ON public.user_preferences USING GIN(email_preferences);
    RAISE NOTICE '   ✅ Created index: idx_user_preferences_email_prefs';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_user_preferences_email_prefs';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'user_preferences' 
      AND indexname = 'idx_user_preferences_privacy_settings'
  ) THEN
    CREATE INDEX idx_user_preferences_privacy_settings ON public.user_preferences USING GIN(privacy_settings);
    RAISE NOTICE '   ✅ Created index: idx_user_preferences_privacy_settings';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_user_preferences_privacy_settings';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'user_preferences' 
      AND indexname = 'idx_user_preferences_streaming_stats'
  ) THEN
    CREATE INDEX idx_user_preferences_streaming_stats ON public.user_preferences USING GIN(streaming_stats);
    RAISE NOTICE '   ✅ Created index: idx_user_preferences_streaming_stats';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_user_preferences_streaming_stats';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'user_preferences' 
      AND indexname = 'idx_user_preferences_achievements'
  ) THEN
    CREATE INDEX idx_user_preferences_achievements ON public.user_preferences USING GIN(achievements);
    RAISE NOTICE '   ✅ Created index: idx_user_preferences_achievements';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_user_preferences_achievements';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'user_preferences' 
      AND indexname = 'idx_user_preferences_music_signals'
  ) THEN
    CREATE INDEX idx_user_preferences_music_signals ON public.user_preferences USING GIN(music_preference_signals);
    RAISE NOTICE '   ✅ Created index: idx_user_preferences_music_signals';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_user_preferences_music_signals';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'user_preferences' 
      AND indexname = 'idx_user_preferences_recommendation_cache'
  ) THEN
    CREATE INDEX idx_user_preferences_recommendation_cache ON public.user_preferences USING GIN(recommendation_cache);
    RAISE NOTICE '   ✅ Created index: idx_user_preferences_recommendation_cache';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_user_preferences_recommendation_cache';
  END IF;
  
  -- Relationships table metadata index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'relationships' 
      AND indexname = 'idx_relationships_metadata'
  ) THEN
    CREATE INDEX idx_relationships_metadata ON public.relationships USING GIN(metadata);
    RAISE NOTICE '   ✅ Created index: idx_relationships_metadata';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_relationships_metadata';
  END IF;
  
  -- Engagements table metadata index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'engagements' 
      AND indexname = 'idx_engagements_metadata'
  ) THEN
    CREATE INDEX idx_engagements_metadata ON public.engagements USING GIN(metadata);
    RAISE NOTICE '   ✅ Created index: idx_engagements_metadata';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_engagements_metadata';
  END IF;
  
  -- Interactions table metadata index (already exists from consolidation, but check)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'interactions' 
      AND indexname = 'idx_interactions_metadata'
  ) THEN
    CREATE INDEX idx_interactions_metadata ON public.interactions USING GIN(metadata);
    RAISE NOTICE '   ✅ Created index: idx_interactions_metadata';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_interactions_metadata';
  END IF;
  
  -- Analytics_daily table metrics index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'analytics_daily' 
      AND indexname = 'idx_analytics_daily_metrics'
  ) THEN
    CREATE INDEX idx_analytics_daily_metrics ON public.analytics_daily USING GIN(metrics);
    RAISE NOTICE '   ✅ Created index: idx_analytics_daily_metrics';
  ELSE
    RAISE NOTICE '   ⚠️ Index already exists: idx_analytics_daily_metrics';
  END IF;
  
  RAISE NOTICE '   ✅ All JSONB indexes verified/created';
END $$;

-- ============================================
-- 4. CREATE COMPATIBILITY VIEWS
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '4. Creating compatibility views for backward compatibility...';
  
  -- View: friends (compatibility view pointing to relationships)
  -- This allows existing code to continue working while we migrate to relationships
  DROP VIEW IF EXISTS public.friends_view CASCADE;
  CREATE VIEW public.friends_view AS
  SELECT 
    r1.id,
    r1.user_id as user1_id,
    r1.related_entity_id::UUID as user2_id,
    r1.created_at,
    r1.updated_at
  FROM public.relationships r1
  WHERE r1.related_entity_type = 'user'
    AND r1.relationship_type = 'friend'
    AND r1.status = 'accepted'
    AND EXISTS (
      -- Ensure bilateral relationship exists
      SELECT 1 FROM public.relationships r2
      WHERE r2.related_entity_type = 'user'
        AND r2.relationship_type = 'friend'
        AND r2.status = 'accepted'
        AND r2.user_id = r1.related_entity_id::UUID
        AND r2.related_entity_id = r1.user_id::TEXT
    )
    AND r1.user_id < r1.related_entity_id::UUID; -- Ensure consistent ordering (user1_id < user2_id)
  
  COMMENT ON VIEW public.friends_view IS 'Compatibility view for friends table - queries relationships table for accepted friendships. Use relationships table directly for new code.';
  RAISE NOTICE '   ✅ Created view: friends_view';
  
  -- View: friend_requests (compatibility view pointing to relationships)
  DROP VIEW IF EXISTS public.friend_requests_view CASCADE;
  CREATE VIEW public.friend_requests_view AS
  SELECT 
    r.id,
    r.user_id as sender_id,
    r.related_entity_id::UUID as receiver_id,
    r.status,
    r.created_at,
    r.updated_at,
    r.metadata->>'request_id' as original_request_id
  FROM public.relationships r
  WHERE r.related_entity_type = 'user'
    AND r.relationship_type = 'friend'
    AND r.status IN ('pending', 'accepted', 'declined')
    AND (r.metadata->>'source_table' = 'friend_requests' OR r.metadata->>'direction' = 'sent');
  
  COMMENT ON VIEW public.friend_requests_view IS 'Compatibility view for friend_requests table - queries relationships table. Use relationships table directly for new code.';
  RAISE NOTICE '   ✅ Created view: friend_requests_view';
  
  RAISE NOTICE '   ✅ Compatibility views created';
  RAISE NOTICE '';
  RAISE NOTICE '   ⚠️  NOTE: Legacy tables (friends, friend_requests) are preserved for now.';
  RAISE NOTICE '       After migrating all code to use relationships table, you can:';
  RAISE NOTICE '       1. Update code to use relationships table directly';
  RAISE NOTICE '       2. Drop legacy tables: DROP TABLE IF EXISTS friends, friend_requests CASCADE;';
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
  friends_in_relationships BIGINT;
  friend_requests_in_relationships BIGINT;
  total_indexes INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICATION ===';
  
  -- Count friendships in relationships table
  SELECT COUNT(*) INTO friends_in_relationships
  FROM public.relationships
  WHERE related_entity_type = 'user'
    AND relationship_type = 'friend'
    AND status = 'accepted';
  
  RAISE NOTICE 'Friendships in relationships table: %', friends_in_relationships;
  
  -- Count friend requests in relationships table
  SELECT COUNT(*) INTO friend_requests_in_relationships
  FROM public.relationships
  WHERE related_entity_type = 'user'
    AND relationship_type = 'friend'
    AND status IN ('pending', 'accepted', 'declined');
  
  RAISE NOTICE 'Friend requests in relationships table: %', friend_requests_in_relationships;
  
  -- Count GIN indexes on JSONB columns
  SELECT COUNT(*) INTO total_indexes
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexdef LIKE '%USING gin%'
    AND tablename IN ('users', 'events', 'user_preferences', 'relationships', 'engagements', 'interactions', 'analytics_daily');
  
  RAISE NOTICE 'GIN indexes on JSONB columns: %', total_indexes;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Migration complete!';
  RAISE NOTICE '';
END $$;

-- Final verification query
SELECT 
  'Migration Complete' as status,
  (SELECT COUNT(*) FROM public.relationships 
   WHERE related_entity_type = 'user' AND relationship_type = 'friend' AND status = 'accepted') as friendships_migrated,
  (SELECT COUNT(*) FROM public.relationships 
   WHERE related_entity_type = 'user' AND relationship_type = 'friend' AND status IN ('pending', 'accepted', 'declined')
   AND (metadata->>'source_table' = 'friend_requests' OR metadata->>'direction' = 'sent')) as friend_requests_migrated,
  (SELECT COUNT(*) FROM pg_indexes 
   WHERE schemaname = 'public' 
   AND indexdef LIKE '%USING gin%' 
   AND tablename IN ('users', 'events', 'user_preferences', 'relationships', 'engagements', 'interactions', 'analytics_daily')) as gin_indexes_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND indexdef LIKE '%USING gin%' 
          AND tablename IN ('users', 'events', 'user_preferences', 'relationships', 'engagements', 'interactions', 'analytics_daily')) >= 10
    THEN 'SUCCESS ✅'
    ELSE 'CHECK REQUIRED ⚠️'
  END as verification_status;

