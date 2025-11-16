-- ============================================
-- STEP 7: FINAL AUDIT
-- ============================================
-- Comprehensive final audit to ensure all consolidations are complete
-- and no redundant tables remain

-- Create categorization tables
CREATE TEMP TABLE IF NOT EXISTS table_categories (
  table_name TEXT PRIMARY KEY,
  category TEXT,
  should_exist BOOLEAN
);

TRUNCATE TABLE table_categories;

-- Insert all known tables by category
INSERT INTO table_categories (table_name, category, should_exist) VALUES
  -- Consolidated core tables (15)
  ('users', 'Consolidated Core', true),
  ('events', 'Consolidated Core', true),
  ('artists', 'Consolidated Core', true),
  ('venues', 'Consolidated Core', true),
  ('relationships', 'Consolidated Core', true),
  ('reviews', 'Consolidated Core', true),
  ('comments', 'Consolidated Core', true),
  ('engagements', 'Consolidated Core', true),
  ('interactions', 'Consolidated Core', true),
  ('analytics_daily', 'Consolidated Core', true),
  ('user_preferences', 'Consolidated Core', true),
  ('chats', 'Consolidated Core', true),
  ('messages', 'Consolidated Core', true),
  ('notifications', 'Consolidated Core', true),
  ('account_permissions', 'Consolidated Core', true),
  
  -- Additional consolidated tables (3)
  ('follows', 'Consolidated Core', true),
  ('user_relationships', 'Consolidated Core', true),
  ('user_genre_preferences', 'Consolidated Core', true),
  
  -- Complex feature tables (8)
  ('event_groups', 'Complex Feature', true),
  ('event_group_members', 'Complex Feature', true),
  ('event_photos', 'Complex Feature', true),
  ('event_tickets', 'Complex Feature', true),
  ('event_claims', 'Complex Feature', true),
  ('moderation_flags', 'Complex Feature', true),
  ('admin_actions', 'Complex Feature', true),
  ('city_centers', 'Complex Feature', true),
  
  -- Monetization table (1)
  ('monetization_tracking', 'Monetization', true)
ON CONFLICT (table_name) DO NOTHING;

-- Get all tables in public schema
CREATE TEMP TABLE IF NOT EXISTS all_tables_audit (
  table_name TEXT PRIMARY KEY,
  exists_in_db BOOLEAN,
  row_count BIGINT,
  column_count INTEGER,
  category TEXT,
  should_exist BOOLEAN,
  status TEXT
);

TRUNCATE TABLE all_tables_audit;

-- Populate audit data
DO $$
DECLARE
  rec RECORD;
  table_exists BOOLEAN;
  row_count_var BIGINT;
  col_count_var INTEGER;
BEGIN
  -- Insert all known tables first
  FOR rec IN SELECT table_name, category, should_exist FROM table_categories ORDER BY table_name LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = rec.table_name
    ) INTO table_exists;
    
    IF table_exists THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', rec.table_name) INTO row_count_var;
      SELECT COUNT(*) INTO col_count_var
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = rec.table_name;
      
      INSERT INTO all_tables_audit VALUES (
        rec.table_name,
        true,
        row_count_var,
        col_count_var,
        rec.category,
        rec.should_exist,
        CASE 
          WHEN rec.should_exist THEN 'EXPECTED ✅'
          ELSE 'SHOULD NOT EXIST ⚠️'
        END
      );
    ELSE
      INSERT INTO all_tables_audit VALUES (
        rec.table_name,
        false,
        0,
        0,
        rec.category,
        rec.should_exist,
        CASE 
          WHEN rec.should_exist THEN 'MISSING ⚠️'
          ELSE 'CORRECTLY MISSING ✅'
        END
      );
    END IF;
  END LOOP;
  
  -- Find any tables not in our known list
  FOR rec IN 
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (
        SELECT 1 FROM table_categories tc WHERE tc.table_name = t.table_name
      )
    ORDER BY t.table_name
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I', rec.table_name) INTO row_count_var;
    SELECT COUNT(*) INTO col_count_var
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = rec.table_name;
    
    INSERT INTO all_tables_audit VALUES (
      rec.table_name,
      true,
      row_count_var,
      col_count_var,
      'UNKNOWN - REVIEW',
      false,
      'NEEDS REVIEW ⚠️'
    );
  END LOOP;
END $$;

-- Summary by category
SELECT 
  'Category Summary' as summary_type,
  category,
  COUNT(*) FILTER (WHERE exists_in_db) as exists_count,
  COUNT(*) FILTER (WHERE NOT exists_in_db AND should_exist) as missing_count,
  SUM(row_count) FILTER (WHERE exists_in_db) as total_rows,
  STRING_AGG(table_name, ', ' ORDER BY table_name) FILTER (
    WHERE NOT exists_in_db AND should_exist
  ) as missing_tables
FROM all_tables_audit
GROUP BY category
ORDER BY 
  CASE category
    WHEN 'Consolidated Core' THEN 1
    WHEN 'Complex Feature' THEN 2
    WHEN 'Monetization' THEN 3
    ELSE 4
  END;

-- Tables that should exist but are missing
SELECT 
  'Missing Tables' as check_type,
  table_name,
  category,
  'MISSING ⚠️' as status
FROM all_tables_audit
WHERE should_exist = true AND exists_in_db = false
ORDER BY category, table_name;

-- Tables that exist but shouldn't (unknown tables)
SELECT 
  'Unknown Tables - Review Needed' as check_type,
  table_name,
  row_count,
  column_count,
  'NEEDS REVIEW ⚠️' as status,
  'Check if this table should be kept or consolidated' as recommendation
FROM all_tables_audit
WHERE category = 'UNKNOWN - REVIEW'
ORDER BY row_count DESC, table_name;

-- Full table listing
SELECT 
  'Full Table Audit' as audit_type,
  table_name,
  category,
  CASE WHEN exists_in_db THEN 'EXISTS ✅' ELSE 'MISSING ⚠️' END as status,
  row_count,
  column_count,
  CASE 
    WHEN should_exist AND NOT exists_in_db THEN 'Should exist but is missing'
    WHEN NOT should_exist AND exists_in_db THEN 'Should not exist'
    WHEN category = 'UNKNOWN - REVIEW' THEN 'Needs review'
    ELSE 'OK'
  END as note
FROM all_tables_audit
ORDER BY 
  CASE category
    WHEN 'Consolidated Core' THEN 1
    WHEN 'Complex Feature' THEN 2
    WHEN 'Monetization' THEN 3
    ELSE 4
  END,
  table_name;

-- Final summary statistics
DO $$
DECLARE
  total_tables INTEGER;
  consolidated_count INTEGER;
  complex_feature_count INTEGER;
  unknown_count INTEGER;
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_tables FROM all_tables_audit WHERE exists_in_db;
  SELECT COUNT(*) INTO consolidated_count FROM all_tables_audit WHERE exists_in_db AND category = 'Consolidated Core';
  SELECT COUNT(*) INTO complex_feature_count FROM all_tables_audit WHERE exists_in_db AND category = 'Complex Feature';
  SELECT COUNT(*) INTO unknown_count FROM all_tables_audit WHERE category = 'UNKNOWN - REVIEW';
  SELECT COUNT(*) INTO missing_count FROM all_tables_audit WHERE should_exist = true AND NOT exists_in_db;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL AUDIT SUMMARY ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Total tables in database: %', total_tables;
  RAISE NOTICE 'Consolidated core tables: %', consolidated_count;
  RAISE NOTICE 'Complex feature tables: %', complex_feature_count;
  RAISE NOTICE 'Unknown tables (need review): %', unknown_count;
  RAISE NOTICE 'Missing expected tables: %', missing_count;
  RAISE NOTICE '';
  
  IF unknown_count > 0 THEN
    RAISE NOTICE '⚠️ WARNING: There are % unknown table(s) that need review', unknown_count;
    RAISE NOTICE '   See "Unknown Tables - Review Needed" section above';
  END IF;
  
  IF missing_count > 0 THEN
    RAISE NOTICE '⚠️ WARNING: % expected table(s) are missing', missing_count;
    RAISE NOTICE '   See "Missing Tables" section above';
  END IF;
  
  IF unknown_count = 0 AND missing_count = 0 THEN
    RAISE NOTICE '✅ SUCCESS: All expected tables exist, no unknown tables found!';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Expected final count: ~27 tables';
  RAISE NOTICE '  - 18 Consolidated core tables';
  RAISE NOTICE '  - 8 Complex feature tables';
  RAISE NOTICE '  - 1 Monetization table';
END $$;
