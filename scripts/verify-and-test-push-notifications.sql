-- ============================================
-- PUSH NOTIFICATION: VERIFY & TEST (ALL STEPS)
-- ============================================
-- Run in Supabase SQL Editor. Executes all steps in sequence.
-- After running: check Webhook logs (webhook path) or worker logs (worker path).
-- Device should receive push within seconds (webhook) or ~30s (worker).
-- ============================================

-- STEP 3a: Active device tokens (last 10)
-- Empty = tokens not registered. Rows present = tokens stored.
SELECT 
  'STEP 3a: Active device tokens' AS step,
  user_id,
  platform,
  is_active,
  app_version,
  created_at
FROM device_tokens 
WHERE is_active = true 
ORDER BY created_at DESC 
LIMIT 10;

-- STEP 3b: Count by platform
SELECT 
  'STEP 3b: Device token counts' AS step,
  platform,
  is_active,
  COUNT(*) AS count
FROM device_tokens
GROUP BY platform, is_active
ORDER BY platform, is_active;

-- STEP 5a: Insert test notification for first user with any active token (iOS or Android)
INSERT INTO notifications (user_id, type, title, message, data, is_read)
SELECT user_id, 'friend_tagged_in_review', 'Test Push', 'Test push notification from Synth', '{}', false
FROM users
WHERE user_id IN (
  SELECT user_id FROM device_tokens WHERE is_active = true
)
ORDER BY user_id
LIMIT 1;

-- STEP 5b: Verify the insert
SELECT 
  'STEP 5b: Latest test notification' AS step,
  id,
  user_id,
  type,
  title,
  message,
  is_read,
  created_at
FROM notifications
WHERE type = 'friend_tagged_in_review'
  AND message LIKE 'Test push%'
ORDER BY created_at DESC
LIMIT 1;
