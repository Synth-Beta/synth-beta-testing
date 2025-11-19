-- Verification Queries for Trigger Migration
-- Run these queries in your Supabase SQL editor to verify triggers were created correctly

-- 1. List all triggers that were created by the migration
SELECT 
  'All Created Triggers' as status,
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND p.proname IN (
    'update_review_counts',
    'update_comment_likes_count',
    'notify_friend_request',
    'notify_friend_accepted',
    'notify_friends_event_interest',
    'trigger_aggregate_analytics',
    'trigger_update_music_preferences',
    'trigger_refresh_recommendations',
    'notify_event_share',
    'notify_group_chat_invite',
    'update_event_promotion_fields'
  )
ORDER BY c.relname, t.tgname;

-- 2. Check if triggers are referencing correct consolidated table names
-- This should show triggers using: reviews, events, users, relationships, etc.
SELECT 
  'Triggers using consolidated tables' as status,
  COUNT(*) as trigger_count
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND (
    -- Check for correct table references in functions
    pg_get_functiondef(p.oid) LIKE '%FROM public.reviews%'
    OR pg_get_functiondef(p.oid) LIKE '%FROM public.events%'
    OR pg_get_functiondef(p.oid) LIKE '%FROM public.users%'
    OR pg_get_functiondef(p.oid) LIKE '%FROM public.relationships%'
    OR pg_get_functiondef(p.oid) LIKE '%FROM public.engagements%'
    OR pg_get_functiondef(p.oid) LIKE '%FROM public.comments%'
    OR pg_get_functiondef(p.oid) LIKE '%FROM public.notifications%'
    OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.reviews%'
    OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.events%'
    OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.user_preferences%'
  );

-- 3. Check for any triggers still using OLD table names (should return 0 rows)
SELECT 
  '⚠️ Triggers with OLD table references' as status,
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND (
    pg_get_functiondef(p.oid) LIKE '%FROM public.user_reviews%'
    OR pg_get_functiondef(p.oid) LIKE '%FROM public.jambase_events%'
    OR pg_get_functiondef(p.oid) LIKE '%FROM public.profiles%'
    OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.user_reviews%'
    OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.jambase_events%'
    OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.profiles%'
  );

-- 4. Check specific triggers we expect to exist
SELECT 
  'Expected Triggers Status' as status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' 
      AND c.relname = 'reviews'
      AND t.tgname = 'trigger_update_music_preferences_on_review'
    ) THEN '✅ Created'
    ELSE '❌ Missing'
  END as music_preferences_review_trigger,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' 
      AND c.relname = 'engagements'
      AND t.tgname = 'update_review_likes_count_insert'
    ) THEN '✅ Created'
    ELSE '❌ Missing'
  END as review_likes_trigger,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' 
      AND c.relname = 'messages'
      AND t.tgname = 'notify_event_share_trigger'
    ) THEN '✅ Created'
    ELSE '❌ Missing'
  END as event_share_trigger;

