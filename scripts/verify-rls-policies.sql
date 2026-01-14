-- ============================================
-- RLS (Row Level Security) Verification Script
-- ============================================
-- This script verifies that all tables have RLS enabled
-- and checks for proper policy configuration.
--
-- Run this in your Supabase SQL Editor to audit RLS coverage.
-- ============================================

-- 1. Check which tables exist in the public schema
SELECT 
  'TABLE_EXISTS_CHECK' as check_type,
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ RLS Enabled'
    ELSE '❌ RLS NOT Enabled - SECURITY RISK'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. List all tables WITHOUT RLS enabled (CRITICAL)
SELECT 
  'TABLES_WITHOUT_RLS' as check_type,
  tablename,
  '❌ CRITICAL: RLS not enabled' as status
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- 3. Count policies per table
SELECT 
  'POLICY_COUNT' as check_type,
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ No policies - SECURITY RISK'
    WHEN COUNT(*) < 2 THEN '⚠️  Few policies - may need review'
    ELSE '✅ Has policies'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count ASC, tablename;

-- 4. List tables with NO policies (CRITICAL)
SELECT 
  'TABLES_WITHOUT_POLICIES' as check_type,
  t.tablename,
  '❌ CRITICAL: No RLS policies defined' as status
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true  -- RLS enabled but no policies
  AND p.policyname IS NULL
ORDER BY t.tablename;

-- 5. Check for overly permissive policies (potential security risk)
SELECT 
  'PERMISSIVE_POLICIES' as check_type,
  tablename,
  policyname,
  cmd as command,
  qual as using_expression,
  CASE 
    WHEN qual IS NULL OR qual = 'true' THEN '⚠️  WARNING: Policy allows all rows'
    WHEN qual LIKE '%auth.uid()%' THEN '✅ Uses auth.uid()'
    WHEN qual LIKE '%auth.role()%' THEN '✅ Uses auth.role()'
    ELSE '⚠️  Review policy expression'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual IS NULL OR qual = 'true' OR qual NOT LIKE '%auth.uid()%')
ORDER BY tablename, policyname;

-- 6. Verify critical tables have proper policies
-- These tables typically contain user data and MUST have RLS
WITH critical_tables AS (
  SELECT unnest(ARRAY[
    'profiles', 'users', 'user_reviews', 'user_settings_preferences',
    'device_tokens', 'push_notification_queue', 'analytics_user_daily',
    'user_verifications', 'user_subscriptions', 'moderation_flags',
    'artist_follows', 'venue_follows', 'event_interests', 'user_event_relationships'
  ]) as tablename
)
SELECT 
  'CRITICAL_TABLE_CHECK' as check_type,
  ct.tablename,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = ct.tablename AND schemaname = 'public') 
      THEN '⚠️  Table does not exist'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE tablename = ct.tablename 
        AND schemaname = 'public' 
        AND rowsecurity = true
    )
      THEN '❌ CRITICAL: RLS not enabled'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = ct.tablename 
        AND schemaname = 'public'
    )
      THEN '❌ CRITICAL: No policies defined'
    ELSE '✅ RLS enabled with policies'
  END as status
FROM critical_tables ct
ORDER BY ct.tablename;

-- 7. Check for policies that might allow unauthorized access
-- Look for policies without proper user context checks
SELECT 
  'POLICY_SECURITY_CHECK' as check_type,
  tablename,
  policyname,
  cmd as command,
  qual as using_expression,
  CASE 
    WHEN qual IS NULL THEN '❌ No USING clause - allows all'
    WHEN qual = 'true' THEN '❌ Allows all rows'
    WHEN qual NOT LIKE '%auth.uid()%' AND qual NOT LIKE '%auth.role()%' THEN '⚠️  Does not use auth context'
    ELSE '✅ Uses auth context'
  END as security_status
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual IS NULL OR qual = 'true' OR (qual NOT LIKE '%auth.uid()%' AND qual NOT LIKE '%auth.role()%'))
ORDER BY tablename, policyname;

-- 8. Summary report
SELECT 
  'SUMMARY' as check_type,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public') as total_tables,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) as tables_with_rls,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false) as tables_without_rls,
  (SELECT COUNT(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public') as tables_with_policies,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false) > 0 
      THEN '❌ CRITICAL: Some tables do not have RLS enabled'
    WHEN (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) > 0 
         AND (SELECT COUNT(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public') = 0
      THEN '❌ CRITICAL: RLS enabled but no policies defined'
    ELSE '✅ All tables have RLS enabled'
  END as overall_status;

-- ============================================
-- RECOMMENDATIONS:
-- ============================================
-- 1. All tables containing user data MUST have RLS enabled
-- 2. All RLS-enabled tables MUST have at least one policy
-- 3. Policies should use auth.uid() or auth.role() to restrict access
-- 4. Test policies by attempting to query as different users
-- 5. Never use 'true' as a policy condition (allows all rows)
-- ============================================




