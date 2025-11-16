-- ============================================
-- STEP 1: ANALYZE ALL REMAINING 28 TABLES
-- ============================================
-- This script provides comprehensive analysis of all remaining tables:
-- - Table existence and row counts
-- - Column structures
-- - Foreign key relationships
-- - Recommendations

-- ============================================
-- PART A: LIST ALL TABLES WITH ROW COUNTS
-- ============================================
CREATE TEMP TABLE IF NOT EXISTS remaining_tables_analysis AS
SELECT 
  t.table_name,
  (
    SELECT COUNT(*) 
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
  ) as column_count,
  0::BIGINT as row_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )
ORDER BY t.table_name;

-- Get row counts for each table
DO $$
DECLARE
  table_rec RECORD;
  row_count_var BIGINT;
BEGIN
  FOR table_rec IN SELECT table_name FROM remaining_tables_analysis ORDER BY table_name
  LOOP
    BEGIN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', table_rec.table_name) INTO row_count_var;
      UPDATE remaining_tables_analysis SET row_count = row_count_var WHERE table_name = table_rec.table_name;
    EXCEPTION WHEN OTHERS THEN
      -- Table might not exist or error, continue
      UPDATE remaining_tables_analysis SET row_count = -1 WHERE table_name = table_rec.table_name;
    END;
  END LOOP;
END $$;

-- Display results
SELECT 
  'Table Overview' as analysis_section,
  table_name,
  column_count,
  CASE WHEN row_count = -1 THEN 'ERROR' ELSE row_count::TEXT END as row_count,
  CASE 
    WHEN table_name IN ('event_groups', 'event_group_members', 'event_photos', 'event_tickets', 'event_claims',
                        'moderation_flags', 'admin_actions', 'city_centers') THEN 'Keep - Complex Feature'
    WHEN table_name IN ('event_photo_likes', 'event_photo_comments', 'event_shares') THEN 'Consolidate'
    WHEN table_name IN ('event_interests', 'event_promotions') THEN 'Check - May Already Be Consolidated'
    WHEN table_name IN ('review_photos', 'review_videos', 'review_tags') THEN 'Check - May Be Redundant'
    WHEN table_name IN ('event_genres', 'artist_genre_mapping', 'artist_genres') THEN 'Review - Genre Handling'
    WHEN table_name IN ('email_preferences', 'user_music_tags') THEN 'Review - Preferences'
    WHEN table_name IN ('email_gate_entries', 'event_ticket_urls') THEN 'Review - Structure'
    ELSE 'Review'
  END as recommendation
FROM remaining_tables_analysis
ORDER BY 
  CASE 
    WHEN table_name IN ('event_groups', 'event_group_members', 'event_photos', 'event_tickets', 'event_claims',
                        'moderation_flags', 'admin_actions', 'city_centers') THEN 1
    WHEN table_name IN ('event_photo_likes', 'event_photo_comments', 'event_shares') THEN 2
    WHEN table_name IN ('event_interests', 'event_promotions') THEN 3
    WHEN table_name IN ('review_photos', 'review_videos', 'review_tags') THEN 4
    WHEN table_name IN ('event_genres', 'artist_genre_mapping', 'artist_genres') THEN 5
    WHEN table_name IN ('email_preferences', 'user_music_tags') THEN 6
    WHEN table_name IN ('email_gate_entries', 'event_ticket_urls') THEN 7
    ELSE 8
  END,
  table_name;

-- ============================================
-- PART B: GET DETAILED STRUCTURE FOR EACH TABLE
-- ============================================
-- This will show all columns for all remaining tables
SELECT 
  'Table Structure' as analysis_section,
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  CASE 
    WHEN c.column_name IN ('id', 'user_id', 'event_id', 'artist_id', 'venue_id', 
                           'photo_id', 'review_id', 'comment_id', 'group_id',
                           'created_by_user_id', 'related_entity_id', 'entity_id',
                           'entity_type', 'related_entity_type') THEN 'KEY'
    WHEN c.column_name LIKE '%_id' THEN 'FK'
    WHEN c.column_name IN ('created_at', 'updated_at', 'created', 'updated') THEN 'TIMESTAMP'
    ELSE 'OTHER'
  END as column_type,
  c.ordinal_position
FROM remaining_tables_analysis t
JOIN information_schema.columns c
  ON t.table_name = c.table_name
WHERE c.table_schema = 'public'
ORDER BY t.table_name, c.ordinal_position;

-- ============================================
-- PART C: FOREIGN KEY RELATIONSHIPS
-- ============================================
SELECT 
  'Foreign Keys' as analysis_section,
  tc.table_name,
  kcu.column_name as fk_column,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM remaining_tables_analysis rt
JOIN information_schema.table_constraints tc
  ON rt.table_name = tc.table_name
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- PART D: CHECK IF TABLES SHOULD BE DROPPED
-- ============================================
-- Check for tables that reference old table names or are clearly redundant
SELECT 
  'Tables to Check for Dropping' as analysis_section,
  table_name,
  CASE 
    WHEN table_name = 'event_interests' THEN 'Check - Should be in relationships table'
    WHEN table_name = 'event_promotions' THEN 'Check - Should be in monetization_tracking'
    WHEN table_name = 'email_preferences' THEN 'Check - Should be in user_preferences'
    WHEN table_name IN ('review_photos', 'review_videos', 'review_tags') THEN 'Check - reviews table may have arrays'
    WHEN table_name = 'event_genres' THEN 'Check - events.genres column may exist'
    WHEN table_name IN ('artist_genre_mapping', 'artist_genres') THEN 'Check - artists.genres column may exist'
    WHEN table_name = 'user_music_tags' THEN 'Check - May overlap with user_genre_preferences'
    ELSE 'Review needed'
  END as action_needed
FROM remaining_tables_analysis
WHERE table_name IN (
  'event_interests', 'event_promotions', 'email_preferences',
  'review_photos', 'review_videos', 'review_tags',
  'event_genres', 'artist_genre_mapping', 'artist_genres',
  'user_music_tags', 'event_ticket_urls'
)
ORDER BY table_name;

DROP TABLE IF EXISTS remaining_tables_analysis;

