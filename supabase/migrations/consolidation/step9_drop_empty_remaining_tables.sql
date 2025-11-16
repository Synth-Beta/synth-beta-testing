-- ============================================
-- STEP 9: DROP EMPTY REMAINING TABLES
-- ============================================
-- Drop empty tables that are known to be redundant

DO $$
DECLARE
  table_exists BOOLEAN;
  row_count_var BIGINT;
  dropped_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== DROP EMPTY REDUNDANT TABLES ===';
  RAISE NOTICE '';
  
  -- Drop account_upgrade_requests (empty, should be in monetization_tracking)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'account_upgrade_requests'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.account_upgrade_requests' INTO row_count_var;
    IF row_count_var = 0 THEN
      DROP TABLE IF EXISTS public.account_upgrade_requests CASCADE;
      RAISE NOTICE '✅ Dropped account_upgrade_requests (empty)';
      dropped_count := dropped_count + 1;
    ELSE
      RAISE NOTICE '⚠️ account_upgrade_requests has % rows - NOT dropped (should be migrated first)', row_count_var;
    END IF;
  END IF;
  
  -- Drop review_photos (empty, should be in reviews.photos array)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_photos'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.review_photos' INTO row_count_var;
    IF row_count_var = 0 THEN
      DROP TABLE IF EXISTS public.review_photos CASCADE;
      RAISE NOTICE '✅ Dropped review_photos (empty)';
      dropped_count := dropped_count + 1;
    ELSE
      RAISE NOTICE '⚠️ review_photos has % rows - NOT dropped', row_count_var;
    END IF;
  END IF;
  
  -- Drop review_tags (empty, should be in reviews tags)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_tags'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.review_tags' INTO row_count_var;
    IF row_count_var = 0 THEN
      DROP TABLE IF EXISTS public.review_tags CASCADE;
      RAISE NOTICE '✅ Dropped review_tags (empty)';
      dropped_count := dropped_count + 1;
    ELSE
      RAISE NOTICE '⚠️ review_tags has % rows - NOT dropped', row_count_var;
    END IF;
  END IF;
  
  -- Drop review_videos (empty, should be in reviews.videos array)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_videos'
  ) INTO table_exists;
  
  IF table_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.review_videos' INTO row_count_var;
    IF row_count_var = 0 THEN
      DROP TABLE IF EXISTS public.review_videos CASCADE;
      RAISE NOTICE '✅ Dropped review_videos (empty)';
      dropped_count := dropped_count + 1;
    ELSE
      RAISE NOTICE '⚠️ review_videos has % rows - NOT dropped', row_count_var;
    END IF;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Dropped % empty table(s)', dropped_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining tables to handle:';
  RAISE NOTICE '  - event_interests (13 rows) - Verify migration to relationships was complete';
  RAISE NOTICE '  - event_ticket_urls (1250 rows) - Verify migration to event_tickets was complete';
  RAISE NOTICE '  - email_preferences (8 rows) - Migrate to user_preferences.email_preferences';
  RAISE NOTICE '  - email_gate_entries (5 rows) - Review purpose';
  RAISE NOTICE '  - consolidation_data_stash (120 rows) - Review and drop if safe';
END $$;

-- Verification
SELECT 
  'Dropped Tables Verification' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'account_upgrade_requests'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as account_upgrade_requests_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_photos'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as review_photos_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_tags'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as review_tags_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_videos'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as review_videos_status;

