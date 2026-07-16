-- ============================================================
-- Public user verification helpers
-- ============================================================

-- 1) Every auth user should have one public.users row.
SELECT
  au.id AS auth_user_id,
  au.email,
  au.raw_user_meta_data
FROM auth.users au
LEFT JOIN public.users pu ON pu.user_id = au.id
WHERE pu.user_id IS NULL
ORDER BY au.created_at DESC
LIMIT 200;

-- 2) No duplicate public.users rows for the same user_id.
SELECT user_id, COUNT(*) AS row_count
FROM public.users
GROUP BY user_id
HAVING COUNT(*) > 1;

-- 3) Manual test: After creating a test Supabase Auth user (e.g. via the dashboard or an API call),
--    run the following query substituting the test email to confirm the trigger created the profile row
--    and that it did not touch other users.
--
--    SELECT au.id, au.email, pu.user_id, pu.name, pu.username
--    FROM auth.users au
--    LEFT JOIN public.users pu ON pu.user_id = au.id
--    WHERE au.email = 'test-user@example.com';
--
--    Expect: pu.user_id IS NOT NULL and username is populated even if the user has not finished onboarding.

-- 4) Ensure we did not update existing profiles while running the trigger (only new rows should show updated_at ~= created_at).
SELECT user_id, created_at, updated_at
FROM public.users
WHERE created_at < now() - INTERVAL '5 minutes'
  AND updated_at > now() - INTERVAL '2 minutes'
ORDER BY updated_at DESC
LIMIT 200;
