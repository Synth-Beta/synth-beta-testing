-- ============================================
-- CONSOLIDATION V2: AUDIT CURRENT STATE
-- ============================================
-- Identify all tables and plan consolidation to 15 core tables

DO $$
DECLARE
  consolidated_count INTEGER;
  supporting_count INTEGER;
  total_count INTEGER;
BEGIN
  RAISE NOTICE '=== CONSOLIDATION V2: CURRENT STATE AUDIT ===';
  RAISE NOTICE '';
  
  -- Count consolidated tables
  SELECT COUNT(*) INTO consolidated_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name IN (
      'users', 'events', 'artists', 'venues',
      'relationships', 'follows', 'user_relationships',
      'reviews', 'comments', 'engagements', 'interactions',
      'chats', 'messages', 'notifications',
      'analytics_daily', 'user_preferences'
    );
  
  -- Count all tables
  SELECT COUNT(*) INTO total_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';
  
  supporting_count := total_count - consolidated_count;
  
  RAISE NOTICE 'Consolidated Tables: %', consolidated_count;
  RAISE NOTICE 'Supporting Tables: %', supporting_count;
  RAISE NOTICE 'Total Tables: %', total_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Target: Consolidate to 15 core tables';
  RAISE NOTICE 'Tables to consolidate: %', supporting_count;
END $$;

-- List all supporting tables with row counts and purpose
SELECT 
  t.table_name,
  (SELECT COUNT(*) 
   FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = t.table_name) as column_count,
  CASE t.table_name
    WHEN 'admin_actions' THEN 'Admin audit log - can merge into users metadata'
    WHEN 'event_claims' THEN 'Event ownership claims - can merge into events metadata'
    WHEN 'event_group_members' THEN 'Event group membership - can merge into relationships'
    WHEN 'event_groups' THEN 'Event groups - can merge into events metadata'
    WHEN 'event_photo_comments' THEN 'Already in comments table'
    WHEN 'event_photos' THEN 'Event media - can merge into events metadata'
    WHEN 'event_promotions' THEN 'Event promotions - can merge into monetization_tracking'
    WHEN 'event_tickets' THEN 'Ticket info - can merge into events metadata'
    WHEN 'moderation_flags' THEN 'Content moderation - can merge into reviews/comments metadata'
    WHEN 'monetization_tracking' THEN 'Monetization - keep as separate or merge into users/events'
    WHEN 'user_genre_preferences' THEN 'Genre preferences - can merge into user_preferences'
    WHEN 'waitlist' THEN 'Waitlist signups - can merge into users metadata'
    WHEN 'account_permissions' THEN 'Permission definitions - can merge into users metadata'
    WHEN 'city_centers' THEN 'City data - can merge into venues or keep if referenced frequently'
    ELSE 'Review needed'
  END as consolidation_strategy
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND LOWER(t.table_name) NOT IN (
    -- Core 15 tables
    'users', 'events', 'artists', 'venues',
    'relationships', 'follows', 'user_relationships',
    'reviews', 'comments', 'engagements', 'interactions',
    'chats', 'messages', 'notifications',
    'analytics_daily', 'user_preferences'
  )
ORDER BY t.table_name;

