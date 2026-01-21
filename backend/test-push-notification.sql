-- ============================================
-- TEST PUSH NOTIFICATION SQL SCRIPT
-- ============================================
-- This script inserts a test notification into the database
-- The push notification worker will pick it up and send it
--
-- Usage:
--   Option 1: Replace 'your-email@example.com' with your email (recommended)
--   Option 2: Replace the user_id CTE with your actual UUID
--   3. Run this query in Supabase SQL Editor
--   4. The worker should process it within 30 seconds
--   5. Check your device for the push notification
-- ============================================

-- Set your user ID here (choose one method):
-- Method 1: By email (recommended - just replace the email)
WITH user_id_lookup AS (
  SELECT id as user_id 
  FROM auth.users 
  WHERE email = 'your-email@example.com'  -- ⚠️ REPLACE THIS WITH YOUR EMAIL
  LIMIT 1
)
-- Method 2: By UUID (uncomment and use this if you know your UUID)
-- WITH user_id_lookup AS (
--   SELECT '00000000-0000-0000-0000-000000000000'::UUID as user_id  -- ⚠️ REPLACE WITH YOUR UUID
-- )

-- Insert test notification
INSERT INTO public.notifications (
  user_id,
  type,
  title,
  message,
  data,
  is_read,
  created_at
)
SELECT 
  u.user_id,
  'message',  -- Using 'message' type (allowed by notifications_type_check constraint)
  'Test Push Notification',
  'This is a test push notification from Supabase! 🎉',
  jsonb_build_object(
    'test', true,
    'timestamp', NOW()::TEXT
  ),
  false,
  NOW()
FROM user_id_lookup u
WHERE u.user_id IS NOT NULL;

-- Verify the notification was created
SELECT 
  id,
  user_id,
  type,
  title,
  message,
  is_read,
  created_at,
  data
FROM public.notifications
WHERE type = 'message'
  AND data->>'test' = 'true'  -- Filter by test flag in data JSONB
ORDER BY created_at DESC
LIMIT 1;

-- Check if device token exists for your user
-- Replace 'your-email@example.com' with your email
SELECT 
  dt.id,
  dt.user_id,
  dt.device_token,
  dt.platform,
  dt.is_active,
  dt.created_at,
  u.email
FROM public.device_tokens dt
JOIN auth.users u ON u.id = dt.user_id
WHERE u.email = 'your-email@example.com'  -- ⚠️ REPLACE THIS WITH YOUR EMAIL
  AND dt.is_active = true;

-- Check push notification queue status
-- Replace 'your-email@example.com' with your email
SELECT 
  pnq.id,
  pnq.notification_id,
  pnq.device_token,
  pnq.status,
  pnq.retry_count,
  pnq.error_message,
  pnq.created_at,
  pnq.sent_at
FROM public.push_notification_queue pnq
JOIN public.notifications n ON n.id = pnq.notification_id
JOIN auth.users u ON u.id = n.user_id
WHERE u.email = 'your-email@example.com'  -- ⚠️ REPLACE THIS WITH YOUR EMAIL
ORDER BY pnq.created_at DESC
LIMIT 10;

