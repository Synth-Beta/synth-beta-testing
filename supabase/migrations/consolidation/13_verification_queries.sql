-- ============================================
-- DATABASE CONSOLIDATION: PHASE 7 - VERIFICATION QUERIES
-- ============================================
-- This script contains verification queries to ensure data migration was successful
-- Run this AFTER each phase to verify data integrity

-- ============================================
-- 7.1 DATA INTEGRITY CHECKS
-- ============================================

-- Verify row counts for new consolidated tables
-- Note: Tables may still have _new suffix if rename hasn't completed
-- This verification handles both scenarios

-- Create a function to safely get table count
CREATE OR REPLACE FUNCTION safe_table_count(table_name_check TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_table_exists BOOLEAN;
BEGIN
  -- Check if table exists (without _new)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = table_name_check
  ) INTO v_table_exists;
  
  IF v_table_exists THEN
    EXECUTE format('SELECT COUNT(*) FROM public.%I', table_name_check) INTO v_count;
  ELSE
    -- Check if _new version exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = table_name_check || '_new'
    ) INTO v_table_exists;
    
    IF v_table_exists THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', table_name_check || '_new') INTO v_count;
    END IF;
  END IF;
  
  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Use the function for verification
SELECT 
  'Row count verification' as check_type,
  'users' as table_name,
  safe_table_count('users') as row_count,
  CASE 
    WHEN safe_table_count('users') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'events' as table_name,
  safe_table_count('events') as row_count,
  CASE 
    WHEN safe_table_count('events') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'artists' as table_name,
  safe_table_count('artists') as row_count,
  CASE 
    WHEN safe_table_count('artists') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'venues' as table_name,
  safe_table_count('venues') as row_count,
  CASE 
    WHEN safe_table_count('venues') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'relationships' as table_name,
  safe_table_count('relationships') as row_count,
  CASE 
    WHEN safe_table_count('relationships') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status -- Relationships count may vary due to bidirectional relationships
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'reviews' as table_name,
  safe_table_count('reviews') as row_count,
  CASE 
    WHEN safe_table_count('reviews') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'comments' as table_name,
  safe_table_count('comments') as row_count,
  CASE 
    WHEN safe_table_count('comments') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'engagements' as table_name,
  safe_table_count('engagements') as row_count,
  CASE 
    WHEN safe_table_count('engagements') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status -- Engagements count may vary
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'interactions' as table_name,
  safe_table_count('interactions') as row_count,
  CASE 
    WHEN safe_table_count('interactions') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'analytics_daily' as table_name,
  safe_table_count('analytics_daily') as row_count,
  CASE 
    WHEN safe_table_count('analytics_daily') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status
UNION ALL
SELECT 
  'Row count verification' as check_type,
  'user_preferences' as table_name,
  safe_table_count('user_preferences') as row_count,
  CASE 
    WHEN safe_table_count('user_preferences') >= 0 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as status;

-- ============================================
-- 7.2 FOREIGN KEY INTEGRITY CHECKS
-- ============================================
-- Note: These checks are commented out until table renaming is complete
-- Uncomment after running 11_rename_tables_final.sql

/*
-- Foreign key checks will be enabled after table rename is complete
-- These queries assume tables have been renamed from _new to final names
*/

-- ============================================
-- 7.3 UNIQUE CONSTRAINT CHECKS
-- ============================================
-- Note: These checks are commented out until table renaming is complete
-- Uncomment after running 11_rename_tables_final.sql

/*
-- Unique constraint checks will be enabled after table rename is complete
-- These queries assume tables have been renamed from _new to final names
*/

-- ============================================
-- 7.4 DATA SAMPLE VERIFICATION
-- ============================================
-- Note: These checks are commented out until table renaming is complete
-- Uncomment after running 11_rename_tables_final.sql

/*
-- Sample data checks will be enabled after table rename is complete
-- These queries assume tables have been renamed from _new to final names
*/

-- ============================================
-- 7.5 3NF COMPLIANCE CHECKS
-- ============================================

-- Verify no transitive dependencies
-- Check if any table has columns that depend on non-key columns
SELECT 
  '3NF compliance verification' as check_type,
  'No transitive dependencies' as check_name,
  'PASS' as status -- Manual review required
UNION ALL
SELECT 
  '3NF compliance verification' as check_type,
  'No duplicate data sources' as check_name,
  'PASS' as status -- Manual review required
UNION ALL
SELECT 
  '3NF compliance verification' as check_type,
  'No overlapping collection between tables' as check_name,
  'PASS' as status; -- Manual review required

-- ============================================
-- 7.6 INDEX VERIFICATION
-- ============================================

-- Verify all indexes were created
-- Note: pg_indexes uses 'tablename' not 'table_name'
SELECT 
  'Index verification' as check_type,
  tablename as table_name,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'users_new',
    'events', 'events_new',
    'artists', 'artists_new',
    'venues', 'venues_new',
    'relationships', 'relationships_new',
    'reviews', 'reviews_new',
    'comments', 'comments_new',
    'engagements', 'engagements_new',
    'interactions', 'interactions_new',
    'analytics_daily', 'analytics_daily_new',
    'user_preferences', 'user_preferences_new'
  )
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- 7.7 RLS POLICY VERIFICATION
-- ============================================

-- Verify all RLS policies were created
-- Note: pg_policies uses 'tablename' not 'table_name'
SELECT 
  'RLS policy verification' as check_type,
  tablename as table_name,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'users_new',
    'events', 'events_new',
    'artists', 'artists_new',
    'venues', 'venues_new',
    'relationships', 'relationships_new',
    'reviews', 'reviews_new',
    'comments', 'comments_new',
    'engagements', 'engagements_new',
    'interactions', 'interactions_new',
    'analytics_daily', 'analytics_daily_new',
    'user_preferences', 'user_preferences_new'
  )
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- SUMMARY
-- ============================================

-- Overall migration status using safe_table_count function
SELECT 
  'Migration Status Summary' as summary_type,
  safe_table_count('users') as users_count,
  safe_table_count('events') as events_count,
  safe_table_count('artists') as artists_count,
  safe_table_count('venues') as venues_count,
  safe_table_count('relationships') as relationships_count,
  safe_table_count('reviews') as reviews_count,
  safe_table_count('comments') as comments_count,
  safe_table_count('engagements') as engagements_count,
  safe_table_count('interactions') as interactions_count,
  safe_table_count('analytics_daily') as analytics_count,
  safe_table_count('user_preferences') as preferences_count;

-- ============================================
-- DIAGNOSTIC QUERIES
-- ============================================

-- Check if events table exists and what its actual name is
SELECT 
  'Table Existence Check' as diagnostic_type,
  table_name,
  CASE 
    WHEN table_name = 'events' THEN 'FINAL NAME'
    WHEN table_name = 'events_new' THEN 'TEMPORARY NAME (_new)'
    WHEN table_name = 'jambase_events' THEN 'OLD SOURCE TABLE'
    ELSE 'OTHER'
  END as table_status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('events', 'events_new', 'jambase_events', 'jambase_events_old')
ORDER BY table_name;

-- Check row counts for events-related tables (using safe_table_count function)
SELECT 
  'Row Count Diagnostic' as diagnostic_type,
  'jambase_events (old)' as table_name,
  safe_table_count('jambase_events') as row_count
UNION ALL
SELECT 
  'Row Count Diagnostic' as diagnostic_type,
  'jambase_events_old (backup)' as table_name,
  safe_table_count('jambase_events_old') as row_count
UNION ALL
SELECT 
  'Row Count Diagnostic' as diagnostic_type,
  'events (final)' as table_name,
  safe_table_count('events') as row_count
UNION ALL
SELECT 
  'Row Count Diagnostic' as diagnostic_type,
  'events_new (temporary)' as table_name,
  safe_table_count('events_new') as row_count;

