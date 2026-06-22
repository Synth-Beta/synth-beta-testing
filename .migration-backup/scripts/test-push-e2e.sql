-- ============================================
-- END-TO-END PUSH TEST (Step 5)
-- ============================================
-- Inserts a test notification for a user who has any active device token (iOS or Android).
-- Run in Supabase SQL Editor.
--
-- After running:
-- - Webhook path: Check Supabase Database > Webhooks > Logs for 200 response
-- - Worker path: Ensure worker is running; check its logs
-- - Device should receive push within seconds (webhook) or ~30s (worker)
-- ============================================

-- Insert test notification for first user with any active token
INSERT INTO notifications (user_id, type, title, message, data, is_read)
SELECT user_id, 'friend_tagged_in_review', 'Test Push', 'Test push notification from Synth', '{}', false
FROM users
WHERE user_id IN (
  SELECT user_id FROM device_tokens WHERE is_active = true
)
ORDER BY user_id
LIMIT 1;

-- Verify the insert (run separately if needed)
SELECT id, user_id, type, title, message, is_read, created_at
FROM notifications
WHERE type = 'friend_tagged_in_review'
  AND message LIKE 'Test push%'
ORDER BY created_at DESC
LIMIT 1;
