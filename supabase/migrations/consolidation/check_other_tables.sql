-- ============================================
-- CHECK: Do other consolidated tables exist?
-- ============================================
-- This checks if the migration created other tables, which would confirm
-- that some migrations ran, but events might have failed

-- Check which consolidated tables exist
SELECT 
  'Consolidated Table Check' as check_type,
  table_name,
  CASE 
    WHEN table_name IN ('users', 'users_new') THEN 'User data'
    WHEN table_name IN ('artists', 'artists_new') THEN 'Artist data'
    WHEN table_name IN ('venues', 'venues_new') THEN 'Venue data'
    WHEN table_name IN ('relationships', 'relationships_new') THEN 'Relationship data'
    WHEN table_name IN ('reviews', 'reviews_new') THEN 'Review data'
    WHEN table_name IN ('comments', 'comments_new') THEN 'Comment data'
    WHEN table_name IN ('engagements', 'engagements_new') THEN 'Engagement data'
    WHEN table_name IN ('interactions', 'interactions_new') THEN 'Interaction data'
    WHEN table_name IN ('analytics_daily', 'analytics_daily_new') THEN 'Analytics data'
    WHEN table_name IN ('user_preferences', 'user_preferences_new') THEN 'User preferences'
    WHEN table_name IN ('events', 'events_new') THEN 'EVENTS - MISSING!'
    ELSE 'Other'
  END as table_category,
  'EXISTS' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'users_new',
    'artists', 'artists_new',
    'venues', 'venues_new',
    'relationships', 'relationships_new',
    'reviews', 'reviews_new',
    'comments', 'comments_new',
    'engagements', 'engagements_new',
    'interactions', 'interactions_new',
    'analytics_daily', 'analytics_daily_new',
    'user_preferences', 'user_preferences_new',
    'events', 'events_new'
  )
ORDER BY 
  CASE 
    WHEN table_name LIKE '%_new' THEN 2
    ELSE 1
  END,
  table_name;

-- Check what old tables still exist (might have data we can migrate)
SELECT 
  'Old Table Check' as check_type,
  table_name,
  'May contain source data' as note
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles',
    'jambase_events',
    'artists',
    'venues',
    'user_reviews',
    'event_comments',
    'review_comments',
    'event_likes',
    'review_likes',
    'user_swipes',
    'matches',
    'friends',
    'friend_requests',
    'artist_follows',
    'venue_follows',
    'user_jambase_events'
  )
ORDER BY table_name;

-- Summary
DO $$
DECLARE
  v_consolidated_count INTEGER;
  v_old_tables_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_consolidated_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('users', 'users_new', 'artists', 'artists_new', 'venues', 'venues_new');
  
  SELECT COUNT(*) INTO v_old_tables_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('profiles', 'jambase_events', 'user_reviews');
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Consolidated tables (users/artists/venues): % exist', v_consolidated_count;
  RAISE NOTICE 'Old source tables (profiles/jambase_events): % exist', v_old_tables_count;
  
  IF v_consolidated_count > 0 AND v_old_tables_count = 0 THEN
    RAISE NOTICE 'Migration appears to have run - old tables were removed';
    RAISE WARNING 'CRITICAL: But events table is missing!';
  ELSIF v_consolidated_count = 0 AND v_old_tables_count > 0 THEN
    RAISE NOTICE 'Migration may not have run - old tables still exist';
    RAISE NOTICE 'RECOMMENDATION: Run migration scripts starting from 03_create_consolidated_tables.sql';
  ELSIF v_consolidated_count > 0 AND v_old_tables_count > 0 THEN
    RAISE NOTICE 'Migration partially complete - both old and new tables exist';
    RAISE WARNING 'RECOMMENDATION: Complete the migration or rollback';
  ELSE
    RAISE WARNING 'CRITICAL: Neither old nor consolidated tables found. Database may be empty or in unexpected state.';
  END IF;
END $$;

