-- ============================================
-- Test Friend Celebration Popup
-- ============================================
-- Simulates friend_accepted notifications for two already-friends users
-- so you can test the celebration popup without going through the accept flow.
--
-- Users: 349bda34-7878-4c10-9f86-ec5888e55571 and 9299b21e-26f6-4a85-8140-7a945f652de7
--
-- Prerequisite: Run migration 20260218000000_new_friend_celebration.sql first.
-- Run this script in Supabase SQL Editor. Then:
-- 1. Sign in as user 349bda34... on one device/simulator
-- 2. Open the app -> celebration popup should appear with 9299's name
-- 3. Sign in as user 9299b21e... on another device/simulator
-- 4. Open the app -> celebration popup should appear with 349's name
-- ============================================

-- Insert friend_accepted for user A (349bda34...) - they see "You and [B's name] are now friends"
INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id, is_read)
SELECT
  '349bda34-7878-4c10-9f86-ec5888e55571'::uuid,
  'friend_accepted',
  'You''re now friends!',
  'You and ' || COALESCE(u.name, 'Friend') || ' are now friends.',
  jsonb_build_object(
    'friend_id', '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid,
    'friend_name', COALESCE(u.name, 'Friend')
  ),
  '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid,
  false
FROM (SELECT 1) _dummy
LEFT JOIN public.users u ON u.user_id = '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid;

-- Insert friend_accepted for user B (9299b21e...) - they see "You and [A's name] are now friends"
INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id, is_read)
SELECT
  '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid,
  'friend_accepted',
  'You''re now friends!',
  'You and ' || COALESCE(u.name, 'Friend') || ' are now friends.',
  jsonb_build_object(
    'friend_id', '349bda34-7878-4c10-9f86-ec5888e55571'::uuid,
    'friend_name', COALESCE(u.name, 'Friend')
  ),
  '349bda34-7878-4c10-9f86-ec5888e55571'::uuid,
  false
FROM (SELECT 1) _dummy
LEFT JOIN public.users u ON u.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid;
