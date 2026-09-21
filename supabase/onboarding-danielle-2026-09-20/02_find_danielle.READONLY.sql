-- Danielle is NOT in public.users by user_id. Find out what actually happened.
-- READ ONLY. No writes, no DDL.
--
-- Slack alerted 2026-09-19T14:52:13Z for auth id d4153f28-78bc-44b9-ba00-5a23ff0e8921,
-- and every Slack path reads public.users by user_id (api/_lib/slackSignup.ts:206-215).
-- So a row matching that id existed yesterday. Query 1 of 01_diagnose returned none.
-- Either the row was removed, or she is an auth.users orphan with no public.users row.
--
-- RUN THESE ONE AT A TIME and read each result.


-- ---------------------------------------------------------------------------
-- 1. Confirm the column names before trusting any lookup.
--    (database.ts has drifted from the real schema - never source column names
--    from it. This reads the live catalog.)
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
  AND column_name IN ('id', 'user_id', 'username', 'email', 'referral_code',
                      'onboarding_completed', 'acquisition_source', 'created_at')
ORDER BY column_name;


-- ---------------------------------------------------------------------------
-- 2. Look for her by EVERY plausible key, not just user_id.
--    Whichever branch returns a row tells you which column the id lives in.
-- ---------------------------------------------------------------------------
SELECT 'by user_id' AS lookup, user_id, id, name, username, email, created_at
FROM public.users WHERE user_id = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921'
UNION ALL
SELECT 'by id', user_id, id, name, username, email, created_at
FROM public.users WHERE id::text = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921'
UNION ALL
SELECT 'by username', user_id, id, name, username, email, created_at
FROM public.users WHERE lower(username) = 'danielle'
UNION ALL
SELECT 'by email', user_id, id, name, username, email, created_at
FROM public.users WHERE lower(email) = 'dchristensen9@yahoo.com'
UNION ALL
SELECT 'by referral_code', user_id, id, name, username, email, created_at
FROM public.users WHERE referral_code = 'd285f5464a';


-- ---------------------------------------------------------------------------
-- 3. Does she exist in auth.users at all? Is she soft-deleted or banned?
--    If this returns a row but query 2 returns nothing, she is an ORPHAN:
--    signed up in auth, never got a public.users row -> cannot use the app.
-- ---------------------------------------------------------------------------
SELECT
  au.id,
  au.email,
  au.created_at,
  au.last_sign_in_at,
  au.email_confirmed_at,
  au.deleted_at,
  au.banned_until,
  au.raw_app_meta_data ->> 'provider' AS auth_provider,
  (SELECT count(*) FROM public.users pu WHERE pu.user_id = au.id) AS public_users_rows
FROM auth.users au
WHERE au.id = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921';


-- ---------------------------------------------------------------------------
-- 4. THE systemic question: any other auth users with no public.users row?
--    Every one of these is a person who signed up and cannot get into the app.
-- ---------------------------------------------------------------------------
SELECT
  au.id,
  au.email,
  au.created_at,
  au.last_sign_in_at,
  au.raw_app_meta_data ->> 'provider' AS auth_provider
FROM auth.users au
LEFT JOIN public.users pu ON pu.user_id = au.id
WHERE pu.user_id IS NULL
  AND au.deleted_at IS NULL
ORDER BY au.created_at DESC;


-- ---------------------------------------------------------------------------
-- 5. Everything created on 2026-09-19, to see her neighbours.
-- ---------------------------------------------------------------------------
SELECT
  user_id, name, username, email, referral_code,
  onboarding_completed, acquisition_source, created_at
FROM public.users
WHERE created_at >= TIMESTAMPTZ '2026-09-19 00:00:00+00'
  AND created_at <  TIMESTAMPTZ '2026-09-21 00:00:00+00'
ORDER BY created_at DESC;


-- ---------------------------------------------------------------------------
-- 6. Sanity: newest 5 rows in public.users. Confirms the table is live and that
--    140 is current, not a stale snapshot.
-- ---------------------------------------------------------------------------
SELECT user_id, name, username, created_at
FROM public.users
ORDER BY created_at DESC
LIMIT 5;
