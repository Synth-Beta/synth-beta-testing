-- ============================================
-- STEP 8: CLEANUP REMAINING TABLES
-- ============================================
-- Handle remaining unknown tables and missing expected tables

DO $$
DECLARE
  rec RECORD;
  table_exists BOOLEAN;
  row_count_var BIGINT;
BEGIN
  RAISE NOTICE '=== CLEANUP REMAINING TABLES ===';
  RAISE NOTICE '';
  
  -- Check if follows table exists (should exist from earlier consolidation)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'follows'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    RAISE NOTICE '⚠️ WARNING: follows table is missing!';
    RAISE NOTICE '   This table should have been created during relationship consolidation.';
    RAISE NOTICE '   Check if it was created with a different name or if the migration failed.';
    RAISE NOTICE '';
  ELSE
    EXECUTE 'SELECT COUNT(*) FROM public.follows' INTO row_count_var;
    RAISE NOTICE '✅ follows table exists (% rows)', row_count_var;
    RAISE NOTICE '';
  END IF;
  
  RAISE NOTICE '=== TABLES TO DROP/CONSOLIDATE ===';
  RAISE NOTICE '';
  
  -- account_upgrade_requests (should be in monetization_tracking)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'account_upgrade_requests'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.account_upgrade_requests' INTO row_count_var;
    IF row_count_var = 0 THEN
      RAISE NOTICE '✅ account_upgrade_requests: EMPTY - Safe to drop';
    ELSE
      RAISE NOTICE '⚠️ account_upgrade_requests: Has % rows - Should be migrated to monetization_tracking first', row_count_var;
    END IF;
  END IF;
  
  -- consolidation_data_stash (temporary migration table)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'consolidation_data_stash'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.consolidation_data_stash' INTO row_count_var;
    RAISE NOTICE '⚠️ consolidation_data_stash: Temporary migration table with % rows', row_count_var;
    RAISE NOTICE '   Review data before dropping - this was used to stash orphaned data during migration';
  END IF;
  
  -- email_gate_entries (needs review)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'email_gate_entries'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.email_gate_entries' INTO row_count_var;
    RAISE NOTICE '⚠️ email_gate_entries: Has % rows - Needs review', row_count_var;
    RAISE NOTICE '   Check if this should be in interactions table or kept separate';
  END IF;
  
  -- email_preferences (should be in user_preferences.email_preferences)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'email_preferences'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.email_preferences' INTO row_count_var;
    IF row_count_var > 0 THEN
      RAISE NOTICE '⚠️ email_preferences: Has % rows - Should be migrated to user_preferences.email_preferences JSONB', row_count_var;
    ELSE
      RAISE NOTICE '✅ email_preferences: EMPTY - Safe to drop';
    END IF;
  END IF;
  
  -- event_interests (should be in relationships)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_interests'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.event_interests' INTO row_count_var;
    RAISE NOTICE '⚠️ event_interests: Has % rows - Should be migrated to relationships table', row_count_var;
    RAISE NOTICE '   Note: We already ran consolidate_event_interests.sql - check if migration was complete';
  END IF;
  
  -- event_ticket_urls (should be in event_tickets)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.event_ticket_urls' INTO row_count_var;
    RAISE NOTICE '⚠️ event_ticket_urls: Has % rows - Should be migrated to event_tickets table', row_count_var;
    RAISE NOTICE '   Note: We already ran consolidate_event_ticket_urls.sql - check if migration was complete';
  END IF;
  
  -- review_photos (should be in reviews.photos array)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_photos'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.review_photos' INTO row_count_var;
    IF row_count_var = 0 THEN
      RAISE NOTICE '✅ review_photos: EMPTY - Safe to drop';
    ELSE
      RAISE NOTICE '⚠️ review_photos: Has % rows - Should be migrated to reviews.photos array', row_count_var;
    END IF;
  END IF;
  
  -- review_tags (should be in reviews tags)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_tags'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.review_tags' INTO row_count_var;
    IF row_count_var = 0 THEN
      RAISE NOTICE '✅ review_tags: EMPTY - Safe to drop';
    ELSE
      RAISE NOTICE '⚠️ review_tags: Has % rows - Should be migrated to reviews tags', row_count_var;
    END IF;
  END IF;
  
  -- review_videos (should be in reviews.videos array)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_videos'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.review_videos' INTO row_count_var;
    IF row_count_var = 0 THEN
      RAISE NOTICE '✅ review_videos: EMPTY - Safe to drop';
    ELSE
      RAISE NOTICE '⚠️ review_videos: Has % rows - Should be migrated to reviews.videos array', row_count_var;
    END IF;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== NEXT STEPS ===';
  RAISE NOTICE '1. Drop empty tables: account_upgrade_requests, review_photos, review_tags, review_videos';
  RAISE NOTICE '2. Verify event_interests and event_ticket_urls migrations were complete';
  RAISE NOTICE '3. Migrate email_preferences to user_preferences.email_preferences if needed';
  RAISE NOTICE '4. Review email_gate_entries and consolidation_data_stash';
  RAISE NOTICE '5. Check why follows table is missing';
END $$;

-- Show detailed summary
SELECT 
  'Cleanup Summary' as summary_type,
  'Empty Tables (Safe to Drop)' as category,
  STRING_AGG(table_name, ', ' ORDER BY table_name) as tables
FROM (
  SELECT 'account_upgrade_requests' as table_name WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account_upgrade_requests'
  ) AND (SELECT COUNT(*) FROM public.account_upgrade_requests) = 0
  UNION ALL
  SELECT 'review_photos' WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_photos'
  ) AND (SELECT COUNT(*) FROM public.review_photos) = 0
  UNION ALL
  SELECT 'review_tags' WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_tags'
  ) AND (SELECT COUNT(*) FROM public.review_photos) = 0
  UNION ALL
  SELECT 'review_videos' WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_videos'
  ) AND (SELECT COUNT(*) FROM public.review_videos) = 0
) empty_tables

UNION ALL

SELECT 
  'Cleanup Summary',
  'Tables with Data (Need Migration or Review)',
  STRING_AGG(table_name, ', ' ORDER BY table_name)
FROM (
  SELECT 'consolidation_data_stash' as table_name WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consolidation_data_stash'
  ) AND (SELECT COUNT(*) FROM public.consolidation_data_stash) > 0
  UNION ALL
  SELECT 'email_gate_entries' WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_gate_entries'
  ) AND (SELECT COUNT(*) FROM public.email_gate_entries) > 0
  UNION ALL
  SELECT 'email_preferences' WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_preferences'
  ) AND (SELECT COUNT(*) FROM public.email_preferences) > 0
  UNION ALL
  SELECT 'event_interests' WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_interests'
  ) AND (SELECT COUNT(*) FROM public.event_interests) > 0
  UNION ALL
  SELECT 'event_ticket_urls' WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
  ) AND (SELECT COUNT(*) FROM public.event_ticket_urls) > 0
) tables_with_data;

