-- ============================================
-- STEP 20: IDENTIFY REMAINING TABLES
-- ============================================
-- Find all tables that aren't in the consolidated or supporting lists

DO $$
DECLARE
  table_rec RECORD;
  unaccounted_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== IDENTIFYING UNACCOUNTED TABLES ===';
  RAISE NOTICE '';
  
  -- List all tables that aren't in our expected lists
  FOR table_rec IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND LOWER(table_name) NOT IN (
        -- Consolidated tables (15)
        'users', 'events', 'artists', 'venues',
        'relationships', 'follows', 'user_relationships',
        'reviews', 'comments', 'engagements', 'interactions',
        'chats', 'messages', 'notifications',
        'analytics_daily', 'user_preferences',
        -- Supporting tables (14)
        'admin_actions', 'event_claims', 'event_group_members',
        'event_groups', 'event_photo_comments', 'event_photos',
        'event_promotions', 'event_tickets', 'moderation_flags',
        'monetization_tracking', 'user_genre_preferences', 'waitlist',
        'account_permissions', 'city_centers'
      )
    ORDER BY table_name
  LOOP
    unaccounted_count := unaccounted_count + 1;
    RAISE NOTICE '%: %', unaccounted_count, table_rec.table_name;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Total unaccounted tables: %', unaccounted_count;
  
  IF unaccounted_count = 0 THEN
    RAISE NOTICE '✅ All tables accounted for!';
  ELSE
    RAISE NOTICE '⚠️ % table(s) need review', unaccounted_count;
  END IF;
END $$;

-- Detailed list with row counts
SELECT 
  t.table_name,
  (SELECT COUNT(*) 
   FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = t.table_name) as column_count,
  CASE 
    WHEN LOWER(t.table_name) LIKE '%_old' THEN 'OLD BACKUP TABLE ⚠️'
    WHEN LOWER(t.table_name) LIKE '%_backup' THEN 'BACKUP TABLE ⚠️'
    WHEN LOWER(t.table_name) LIKE '%_new' THEN 'TEMP TABLE ⚠️'
    WHEN LOWER(t.table_name) LIKE '%_temp' THEN 'TEMP TABLE ⚠️'
    WHEN LOWER(t.table_name) LIKE '%_stash' THEN 'STASH TABLE ⚠️'
    ELSE 'SUPPORTING TABLE ✅'
  END as table_type
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND LOWER(t.table_name) NOT IN (
    -- Consolidated tables (15)
    'users', 'events', 'artists', 'venues',
    'relationships', 'follows', 'user_relationships',
    'reviews', 'comments', 'engagements', 'interactions',
    'chats', 'messages', 'notifications',
    'analytics_daily', 'user_preferences',
    -- Supporting tables (14)
    'admin_actions', 'event_claims', 'event_group_members',
    'event_groups', 'event_photo_comments', 'event_photos',
    'event_promotions', 'event_tickets', 'moderation_flags',
    'monetization_tracking', 'user_genre_preferences', 'waitlist',
    'account_permissions', 'city_centers'
  )
ORDER BY t.table_name;

