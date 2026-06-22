-- ============================================
-- Test Friend Celebration: 349bda34 vs 9299b21e
-- ============================================
-- Users: 349bda34-7878-4c10-9f86-ec5888e55571 and 9299b21e-26f6-4a85-8140-7a945f652de7
--
-- 1. Ensures friendship exists
-- 2. Inserts unread friend_accepted notifications for both
--
-- Run in Supabase SQL Editor. Then sign in as either user and open the app.
--
-- PREREQUISITE: Both users must exist in public.users. If either is missing, run:
--   SELECT user_id, name FROM public.users WHERE user_id IN (
--     '349bda34-7878-4c10-9f86-ec5888e55571', '9299b21e-26f6-4a85-8140-7a945f652de7'
--   );
-- To find another valid user to pair with 349bda34:
--   SELECT user_id, name FROM public.users WHERE user_id != '349bda34-7878-4c10-9f86-ec5888e55571' LIMIT 5;
-- ============================================

-- Step 0: Ensure both users exist in public.users (create from auth.users if missing)
INSERT INTO public.users (user_id, name, username, bio, created_at, updated_at)
SELECT au.id,
       COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', SPLIT_PART(au.email, '@', 1), 'User'),
       COALESCE(au.raw_user_meta_data->>'user_name', 'user_' || left(replace(au.id::text, '-', ''), 12)),
       NULL,
       now(),
       now()
FROM auth.users au
WHERE au.id IN ('349bda34-7878-4c10-9f86-ec5888e55571'::uuid, '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = au.id)
ON CONFLICT (user_id) DO NOTHING;

-- Abort if either user still missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid) THEN
    RAISE EXCEPTION 'User 9299b21e-26f6-4a85-8140-7a945f652de7 not found in public.users or auth.users. '
      'Use a different user - run: SELECT user_id, name FROM public.users LIMIT 10;';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid) THEN
    RAISE EXCEPTION 'User 349bda34-7878-4c10-9f86-ec5888e55571 not found in public.users or auth.users.';
  END IF;
END $$;

-- Step 1: Ensure friendship exists (create if not)
INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status, created_at, updated_at)
SELECT '349bda34-7878-4c10-9f86-ec5888e55571'::uuid, '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid, 'friend', 'accepted', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_relationships
  WHERE relationship_type = 'friend' AND status = 'accepted'
    AND ((user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid AND related_user_id = '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid)
         OR (user_id = '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid AND related_user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid))
);

INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status, created_at, updated_at)
SELECT '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid, '349bda34-7878-4c10-9f86-ec5888e55571'::uuid, 'friend', 'accepted', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_relationships
  WHERE user_id = '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid
    AND related_user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid
    AND relationship_type = 'friend'
);

-- Step 2: Mark any existing friend_accepted as read (so we get fresh unread ones)
UPDATE public.notifications
SET is_read = true
WHERE type = 'friend_accepted'
  AND (
    (user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid AND (data->>'friend_id')::uuid = '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid)
    OR (user_id = '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid AND (data->>'friend_id')::uuid = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid)
  );

-- Step 3: Insert friend_accepted for user 349bda34 (they see "You and [2620's name] are now friends")
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

-- Step 4: Insert friend_accepted for user 2620af34 (they see "You and [349's name] are now friends")
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

-- Step 5: Verify notifications were inserted
SELECT user_id, type, data->>'friend_id' AS friend_id, data->>'friend_name' AS friend_name, is_read
FROM public.notifications
WHERE type = 'friend_accepted' AND is_read = false
  AND user_id IN ('349bda34-7878-4c10-9f86-ec5888e55571'::uuid, '9299b21e-26f6-4a85-8140-7a945f652de7'::uuid)
ORDER BY user_id;

-- Step 6: Verify RPC exists (migration 20260219000000 must be applied)
SELECT proname AS rpc_name
FROM pg_proc
WHERE proname = 'get_new_friend_celebration_data';
-- If empty: run migrations (npx supabase db push) then re-run this script.
