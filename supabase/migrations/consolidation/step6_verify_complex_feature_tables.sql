-- ============================================
-- STEP 6: VERIFY COMPLEX FEATURE TABLES
-- ============================================
-- Verify that complex feature tables are present and should be kept
-- These are legitimate separate tables for complex features

-- List of complex feature tables that should be kept
CREATE TEMP TABLE IF NOT EXISTS complex_feature_tables (
  table_name TEXT PRIMARY KEY,
  purpose TEXT,
  should_keep BOOLEAN DEFAULT true
);

TRUNCATE TABLE complex_feature_tables;

INSERT INTO complex_feature_tables (table_name, purpose) VALUES
  ('event_groups', 'User-created event groups'),
  ('event_group_members', 'Members of event groups'),
  ('event_photos', 'User-uploaded event photos'),
  ('event_tickets', 'Detailed ticket information'),
  ('event_claims', 'Event claiming workflow'),
  ('moderation_flags', 'Content moderation'),
  ('admin_actions', 'Admin action log'),
  ('city_centers', 'Location reference data')
ON CONFLICT (table_name) DO NOTHING;

-- Check which complex feature tables exist
SELECT 
  'Complex Feature Tables' as check_type,
  cft.table_name,
  cft.purpose,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = cft.table_name
    ) THEN 'EXISTS ✅'
    ELSE 'MISSING ⚠️'
  END as status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = cft.table_name
    ) THEN (
      SELECT COUNT(*)::TEXT 
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = cft.table_name
    )
    ELSE '0'
  END as column_count,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = cft.table_name
    ) THEN 'See DO block below'
    ELSE '0'
  END as row_count,
  cft.should_keep as keep_table
FROM complex_feature_tables cft
ORDER BY cft.table_name;

-- Alternative approach using DO block for row counts
DO $$
DECLARE
  rec RECORD;
  table_exists BOOLEAN;
  row_count_var BIGINT;
BEGIN
  RAISE NOTICE '=== COMPLEX FEATURE TABLES VERIFICATION ===';
  RAISE NOTICE '';
  
  FOR rec IN SELECT table_name, purpose FROM complex_feature_tables ORDER BY table_name LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = rec.table_name
    ) INTO table_exists;
    
    IF table_exists THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', rec.table_name) INTO row_count_var;
      RAISE NOTICE '✅ %', rec.table_name;
      RAISE NOTICE '   Purpose: %', rec.purpose;
      RAISE NOTICE '   Row count: %', row_count_var;
      RAISE NOTICE '   Status: KEEP (Complex feature table)';
      RAISE NOTICE '';
    ELSE
      RAISE NOTICE '⚠️ %', rec.table_name;
      RAISE NOTICE '   Purpose: %', rec.purpose;
      RAISE NOTICE '   Status: MISSING';
      RAISE NOTICE '';
    END IF;
  END LOOP;
  
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Complex feature tables should be kept as separate tables.';
  RAISE NOTICE 'They support distinct features that require separate schemas.';
END $$;

-- Create temp table for row counts
CREATE TEMP TABLE IF NOT EXISTS complex_tables_row_counts (
  table_name TEXT PRIMARY KEY,
  row_count BIGINT
);

TRUNCATE TABLE complex_tables_row_counts;

-- Populate row counts using DO block
DO $$
DECLARE
  rec RECORD;
  table_exists BOOLEAN;
  row_count_var BIGINT;
BEGIN
  FOR rec IN SELECT table_name FROM complex_feature_tables ORDER BY table_name LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = rec.table_name
    ) INTO table_exists;
    
    IF table_exists THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', rec.table_name) INTO row_count_var;
      INSERT INTO complex_tables_row_counts VALUES (rec.table_name, row_count_var);
    ELSE
      INSERT INTO complex_tables_row_counts VALUES (rec.table_name, 0);
    END IF;
  END LOOP;
END $$;

-- Output row counts as table
SELECT 
  'Complex Feature Tables Row Counts' as check_type,
  cft.table_name,
  cft.purpose,
  COALESCE(ctrc.row_count, 0) as row_count,
  CASE 
    WHEN COALESCE(ctrc.row_count, 0) > 0 THEN 'HAS DATA ✅'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = cft.table_name
    ) THEN 'EXISTS (empty)'
    ELSE 'MISSING ⚠️'
  END as status,
  'KEEP (Complex feature table)' as recommendation
FROM complex_feature_tables cft
LEFT JOIN complex_tables_row_counts ctrc ON cft.table_name = ctrc.table_name
ORDER BY cft.table_name;

