-- ============================================
-- ANALYZE EACH OF THE 28 REMAINING TABLES
-- ============================================
-- Run this to see detailed structure and data for each table
-- Replace 'TABLE_NAME' with the actual table name you want to review

-- ============================================
-- STEP 1: LIST ALL REMAINING TABLES
-- ============================================
SELECT 
  'Step 1: All Remaining Tables' as step,
  table_name,
  (
    SELECT COUNT(*) 
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
  ) as column_count
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

-- ============================================
-- STEP 2: FOR EACH TABLE, GET DETAILED STRUCTURE
-- ============================================
-- Uncomment the table you want to analyze:

-- event_groups
-- SELECT 'event_groups Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_groups' ORDER BY ordinal_position;

-- event_group_members
-- SELECT 'event_group_members Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_group_members' ORDER BY ordinal_position;

-- event_photos
-- SELECT 'event_photos Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_photos' ORDER BY ordinal_position;

-- event_photo_likes
-- SELECT 'event_photo_likes Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_photo_likes' ORDER BY ordinal_position;

-- event_photo_comments
-- SELECT 'event_photo_comments Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_photo_comments' ORDER BY ordinal_position;

-- event_tickets
-- SELECT 'event_tickets Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_tickets' ORDER BY ordinal_position;

-- event_ticket_urls
-- SELECT 'event_ticket_urls Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_ticket_urls' ORDER BY ordinal_position;

-- event_claims
-- SELECT 'event_claims Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_claims' ORDER BY ordinal_position;

-- event_shares
-- SELECT 'event_shares Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_shares' ORDER BY ordinal_position;

-- event_interests
-- SELECT 'event_interests Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_interests' ORDER BY ordinal_position;

-- event_genres
-- SELECT 'event_genres Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_genres' ORDER BY ordinal_position;

-- event_promotions
-- SELECT 'event_promotions Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_promotions' ORDER BY ordinal_position;

-- review_photos
-- SELECT 'review_photos Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'review_photos' ORDER BY ordinal_position;

-- review_videos
-- SELECT 'review_videos Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'review_videos' ORDER BY ordinal_position;

-- review_tags
-- SELECT 'review_tags Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'review_tags' ORDER BY ordinal_position;

-- moderation_flags
-- SELECT 'moderation_flags Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'moderation_flags' ORDER BY ordinal_position;

-- admin_actions
-- SELECT 'admin_actions Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_actions' ORDER BY ordinal_position;

-- artist_genre_mapping
-- SELECT 'artist_genre_mapping Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'artist_genre_mapping' ORDER BY ordinal_position;

-- artist_genres
-- SELECT 'artist_genres Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'artist_genres' ORDER BY ordinal_position;

-- city_centers
-- SELECT 'city_centers Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'city_centers' ORDER BY ordinal_position;

-- email_preferences
-- SELECT 'email_preferences Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_preferences' ORDER BY ordinal_position;

-- email_gate_entries
-- SELECT 'email_gate_entries Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_gate_entries' ORDER BY ordinal_position;

-- user_music_tags
-- SELECT 'user_music_tags Structure' as info_type, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_music_tags' ORDER BY ordinal_position;

-- ============================================
-- STEP 3: GET ROW COUNTS FOR EACH TABLE
-- ============================================
-- Dynamic row count query (handles non-existent tables gracefully)
DO $$
DECLARE
  table_rec RECORD;
  row_count_var INTEGER;
  result_text TEXT := '';
BEGIN
  FOR table_rec IN 
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN (
        'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
        'relationships', 'reviews', 'comments', 'engagements', 'interactions',
        'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
        'account_permissions', 'monetization_tracking', 'user_genre_preferences',
        'consolidation_data_stash'
      )
    ORDER BY table_name
  LOOP
    BEGIN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', table_rec.table_name) INTO row_count_var;
      result_text := result_text || table_rec.table_name || ': ' || row_count_var || E'\n';
    EXCEPTION WHEN OTHERS THEN
      result_text := result_text || table_rec.table_name || ': ERROR - ' || SQLERRM || E'\n';
    END;
  END LOOP;
  
  RAISE NOTICE '%', '=== Row Counts ===';
  RAISE NOTICE '%', result_text;
END $$;

-- ============================================
-- STEP 4: CHECK FOREIGN KEY RELATIONSHIPS
-- ============================================
SELECT 
  'Foreign Keys' as info_type,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name NOT IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )
ORDER BY tc.table_name, kcu.column_name;

