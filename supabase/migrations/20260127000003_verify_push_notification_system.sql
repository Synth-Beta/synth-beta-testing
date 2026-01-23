-- ============================================
-- VERIFY PUSH NOTIFICATION SYSTEM
-- ============================================
-- This script verifies that the push notification system
-- is properly configured and active.
-- Run this in Supabase SQL Editor to check system status.

-- ============================================
-- 1. Check if trigger exists and is enabled
-- ============================================
DO $$
DECLARE
  trigger_exists boolean;
  trigger_enabled text;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_queue_push_notification'
    AND tgrelid = 'public.notifications'::regclass
  ) INTO trigger_exists;
  
  IF trigger_exists THEN
    SELECT tgenabled INTO trigger_enabled
    FROM pg_trigger
    WHERE tgname = 'trigger_queue_push_notification'
    AND tgrelid = 'public.notifications'::regclass;
    
    RAISE NOTICE '✅ Trigger exists: trigger_queue_push_notification';
    RAISE NOTICE '   Status: %', CASE trigger_enabled 
      WHEN 'O' THEN 'ENABLED' 
      WHEN 'D' THEN 'DISABLED'
      WHEN 'R' THEN 'REPLICA'
      WHEN 'A' THEN 'ALWAYS'
      ELSE 'UNKNOWN'
    END;
  ELSE
    RAISE WARNING '❌ Trigger does NOT exist: trigger_queue_push_notification';
  END IF;
END $$;

-- ============================================
-- 2. Check if function exists
-- ============================================
DO $$
DECLARE
  function_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc
    WHERE proname = 'queue_push_notification'
    AND pronamespace = 'public'::regnamespace
  ) INTO function_exists;
  
  IF function_exists THEN
    RAISE NOTICE '✅ Function exists: queue_push_notification()';
  ELSE
    RAISE WARNING '❌ Function does NOT exist: queue_push_notification()';
  END IF;
END $$;

-- ============================================
-- 3. Check if tables exist
-- ============================================
DO $$
DECLARE
  notifications_table_exists boolean;
  device_tokens_table_exists boolean;
  push_queue_table_exists boolean;
  user_prefs_table_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) INTO notifications_table_exists;
  
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'device_tokens'
  ) INTO device_tokens_table_exists;
  
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'push_notification_queue'
  ) INTO push_queue_table_exists;
  
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_settings_preferences'
  ) INTO user_prefs_table_exists;
  
  IF notifications_table_exists THEN
    RAISE NOTICE '✅ Table exists: notifications';
  ELSE
    RAISE WARNING '❌ Table does NOT exist: notifications';
  END IF;
  
  IF device_tokens_table_exists THEN
    RAISE NOTICE '✅ Table exists: device_tokens';
  ELSE
    RAISE WARNING '❌ Table does NOT exist: device_tokens';
  END IF;
  
  IF push_queue_table_exists THEN
    RAISE NOTICE '✅ Table exists: push_notification_queue';
  ELSE
    RAISE WARNING '❌ Table does NOT exist: push_notification_queue';
  END IF;
  
  IF user_prefs_table_exists THEN
    RAISE NOTICE '✅ Table exists: user_settings_preferences';
  ELSE
    RAISE WARNING '❌ Table does NOT exist: user_settings_preferences';
  END IF;
END $$;

-- ============================================
-- 4. Check queue status (summary statistics)
-- ============================================
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM public.push_notification_queue
GROUP BY status
ORDER BY status;

-- ============================================
-- 5. Check active device tokens count
-- ============================================
SELECT 
  platform,
  COUNT(*) as active_tokens,
  COUNT(DISTINCT user_id) as unique_users
FROM public.device_tokens
WHERE is_active = true
GROUP BY platform;

-- ============================================
-- 6. Check user preferences summary
-- ============================================
SELECT 
  enable_push_notifications,
  COUNT(*) as user_count
FROM public.user_settings_preferences
GROUP BY enable_push_notifications;

-- ============================================
-- 7. Sample recent queue items (if any)
-- ============================================
SELECT 
  id,
  user_id,
  notification_id,
  status,
  created_at,
  sent_at,
  error_message
FROM public.push_notification_queue
ORDER BY created_at DESC
LIMIT 10;
