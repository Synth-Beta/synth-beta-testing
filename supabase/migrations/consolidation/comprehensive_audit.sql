-- ============================================
-- COMPREHENSIVE DATABASE AUDIT
-- ============================================
-- Audits the current state of the database to understand what was actually created
-- This script is safe to run - it checks for table/column existence before querying

-- ============================================
-- STEP 1: LIST ALL TABLES
-- ============================================
SELECT 
  'All Tables in Database' as audit_section,
  table_name,
  table_type,
  COALESCE((
    SELECT COUNT(*)::TEXT
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
  ), '0') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- STEP 2: AUDIT CONSOLIDATED TABLES (Row Counts)
-- ============================================
DO $$
DECLARE
  tbl_name TEXT;
  row_cnt BIGINT;
  col_info TEXT;
  result_rows TEXT := '';
BEGIN
  RAISE NOTICE '=== Consolidated Tables Row Counts ===';
  
  FOR tbl_name IN 
    SELECT unnest(ARRAY[
      'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
      'relationships', 'reviews', 'comments', 'engagements', 'interactions',
      'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
      'account_permissions', 'monetization_tracking', 'user_genre_preferences',
      'consolidation_data_stash'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl_name
    ) THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', tbl_name) INTO row_cnt;
      
      -- Get primary key column name
      SELECT string_agg(column_name, ', ') INTO col_info
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = tbl_name
        AND tc.constraint_type = 'PRIMARY KEY';
      
      result_rows := result_rows || format(E'%s: %s rows (PK: %s)\n', tbl_name, row_cnt, COALESCE(col_info, 'none'));
    ELSE
      result_rows := result_rows || format(E'%s: MISSING\n', tbl_name);
    END IF;
  END LOOP;
  
  RAISE NOTICE '%', result_rows;
END $$;

-- ============================================
-- STEP 3: AUDIT TABLE COLUMNS (Structure)
-- ============================================
SELECT 
  'Table Structure' as audit_section,
  t.table_name,
  c.column_name,
  c.data_type,
  c.character_maximum_length,
  c.is_nullable,
  c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c
  ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences'
  )
ORDER BY t.table_name, c.ordinal_position;

-- ============================================
-- STEP 4: AUDIT FOREIGN KEYS (Fixed Type Issues)
-- ============================================
DO $$
DECLARE
  orphan_count BIGINT;
  fk_info RECORD;
  result_text TEXT := '';
BEGIN
  RAISE NOTICE '=== Foreign Key Integrity Check ===';
  
  -- Check users -> events
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'created_by_user_id'
  ) THEN
    SELECT COUNT(*) INTO orphan_count
    FROM public.events e
    WHERE e.created_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = e.created_by_user_id);
    result_text := result_text || format(E'users -> events: %s orphaned\n', orphan_count);
  END IF;
  
  -- Check users -> reviews
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'reviews'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'user_id'
  ) THEN
    SELECT COUNT(*) INTO orphan_count
    FROM public.reviews r
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = r.user_id);
    result_text := result_text || format(E'users -> reviews: %s orphaned\n', orphan_count);
  END IF;
  
  -- Check events -> reviews (FIXED: Handle type mismatches)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'reviews'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'event_id'
  ) THEN
    -- Check what type event_id is in reviews table
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
        AND NOT EXISTS (
          SELECT 1 FROM public.events e 
          WHERE e.id::TEXT = r.event_id 
             OR (SELECT id::TEXT FROM public.events WHERE id::TEXT = r.event_id LIMIT 1) IS NOT NULL
        );
    ELSE
      -- Try both approaches
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
    result_text := result_text || format(E'events -> reviews: %s orphaned\n', orphan_count);
  END IF;
  
  -- Check users -> follows
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'follows'
  ) THEN
    SELECT COUNT(*) INTO orphan_count
    FROM public.follows f
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = f.user_id);
    result_text := result_text || format(E'users -> follows: %s orphaned\n', orphan_count);
  END IF;
  
  -- Check users -> user_relationships
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_relationships'
  ) THEN
    SELECT COUNT(*) INTO orphan_count
    FROM public.user_relationships ur
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = ur.user_id)
       OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = ur.related_user_id);
    result_text := result_text || format(E'users -> user_relationships: %s orphaned\n', orphan_count);
  END IF;
  
  RAISE NOTICE '%', result_text;
END $$;

-- ============================================
-- STEP 5: CHECK FOR OLD TABLES THAT SHOULD BE DROPPED
-- ============================================
SELECT 
  'Old Tables Still Present' as audit_section,
  t.table_name,
  CASE 
    WHEN t.table_name LIKE '%_old' OR t.table_name LIKE '%_backup' OR t.table_name LIKE '%_new' THEN 'Migration Temp/Backup Table'
    WHEN t.table_name IN ('profiles', 'jambase_events', 'artist_profile', 'venue_profile',
                        'artist_follows', 'venue_follows', 'user_jambase_events',
                        'friends', 'friend_requests', 'matches', 'user_blocks',
                        'user_reviews', 'event_comments', 'review_comments',
                        'event_likes', 'review_likes', 'comment_likes', 'review_shares',
                        'user_interactions', 'analytics_user_daily', 'analytics_event_daily',
                        'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                        'streaming_profiles', 'user_streaming_stats_summary',
                        'music_preference_signals', 'user_recommendations_cache',
                        'user_genre_interactions', 'user_artist_interactions',
                        'user_song_interactions', 'user_venue_interactions',
                        'user_artists', 'user_venues', 'user_events') THEN 'Should Be Dropped (Consolidated)'
    ELSE 'Unknown Status'
  END as status,
  COALESCE((
    SELECT COUNT(*)::TEXT
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
  ), '0') as column_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND (
    t.table_name LIKE '%_old'
    OR t.table_name LIKE '%_backup'
    OR t.table_name LIKE '%_new'
    OR t.table_name IN ('profiles', 'jambase_events', 'artist_profile', 'venue_profile',
                      'artist_follows', 'venue_follows', 'user_jambase_events',
                      'friends', 'friend_requests', 'matches', 'user_blocks',
                      'user_reviews', 'event_comments', 'review_comments',
                      'event_likes', 'review_likes', 'comment_likes', 'review_shares',
                      'user_interactions', 'analytics_user_daily', 'analytics_event_daily',
                      'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                      'streaming_profiles', 'user_streaming_stats_summary',
                      'music_preference_signals', 'user_recommendations_cache',
                      'user_genre_interactions', 'user_artist_interactions',
                      'user_song_interactions', 'user_venue_interactions',
                      'user_artists', 'user_venues', 'user_events')
  )
ORDER BY 
  CASE 
    WHEN t.table_name LIKE '%_old' OR t.table_name LIKE '%_backup' OR t.table_name LIKE '%_new' THEN 1
    WHEN t.table_name IN ('profiles', 'jambase_events', 'artist_profile', 'venue_profile',
                        'artist_follows', 'venue_follows', 'user_jambase_events',
                        'friends', 'friend_requests', 'matches', 'user_blocks',
                        'user_reviews', 'event_comments', 'review_comments',
                        'event_likes', 'review_likes', 'comment_likes', 'review_shares',
                        'user_interactions', 'analytics_user_daily', 'analytics_event_daily',
                        'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                        'streaming_profiles', 'user_streaming_stats_summary',
                        'music_preference_signals', 'user_recommendations_cache',
                        'user_genre_interactions', 'user_artist_interactions',
                        'user_song_interactions', 'user_venue_interactions',
                        'user_artists', 'user_venues', 'user_events') THEN 2
    ELSE 3
  END,
  t.table_name;

-- ============================================
-- STEP 6: CHECK INDEXES ON CONSOLIDATED TABLES
-- ============================================
SELECT 
  'Indexes on Consolidated Tables' as audit_section,
  tablename as table_name,
  indexname as index_name,
  indexdef as index_definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences'
  )
ORDER BY tablename, indexname;

-- ============================================
-- STEP 7: CHECK RLS POLICIES
-- ============================================
SELECT 
  'RLS Policies' as audit_section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences'
  )
ORDER BY tablename, policyname;

-- ============================================
-- STEP 8: CHECK CONSTRAINTS
-- ============================================
SELECT 
  'Constraints' as audit_section,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences'
  )
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ============================================
-- STEP 9: SAMPLE DATA FROM KEY TABLES
-- ============================================
DO $$
DECLARE
  tbl_name TEXT;
  sample_count INT := 5;
  row_sample RECORD;
  result_text TEXT := '';
BEGIN
  RAISE NOTICE '=== Sample Data from Key Tables ===';
  
  FOR tbl_name IN 
    SELECT unnest(ARRAY['users', 'events', 'artists', 'venues', 'reviews', 'follows', 'user_relationships', 'relationships'])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl_name
    ) THEN
      result_text := result_text || format(E'\n--- %s ---\n', tbl_name);
      
      -- Get sample rows (limit to avoid huge output)
      EXECUTE format('SELECT * FROM public.%I LIMIT %s', tbl_name, sample_count)
      INTO row_sample;
      
      -- This will show structure but not data - for actual data, use a different approach
      result_text := result_text || format(E'Table exists with columns defined\n');
    END IF;
  END LOOP;
  
  RAISE NOTICE '%', result_text;
END $$;

-- ============================================
-- STEP 10: SUMMARY STATISTICS
-- ============================================
SELECT 
  'Summary Statistics' as audit_section,
  COUNT(*) FILTER (WHERE table_name IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences'
  )) as consolidated_tables_count,
  COUNT(*) FILTER (WHERE table_name LIKE '%_old' OR table_name LIKE '%_backup' OR table_name LIKE '%_new') as temp_backup_tables_count,
  COUNT(*) FILTER (WHERE table_name IN (
    'profiles', 'jambase_events', 'artist_profile', 'venue_profile',
    'artist_follows', 'venue_follows', 'user_jambase_events',
    'friends', 'friend_requests', 'matches', 'user_blocks',
    'user_reviews', 'event_comments', 'review_comments',
    'event_likes', 'review_likes', 'comment_likes', 'review_shares',
    'user_interactions', 'analytics_user_daily', 'analytics_event_daily',
    'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
    'streaming_profiles', 'user_streaming_stats_summary',
    'music_preference_signals', 'user_recommendations_cache',
    'user_genre_interactions', 'user_artist_interactions',
    'user_song_interactions', 'user_venue_interactions',
    'user_artists', 'user_venues', 'user_events'
  )) as old_tables_still_present,
  COUNT(*) as total_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

