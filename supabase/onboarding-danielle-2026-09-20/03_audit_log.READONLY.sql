-- Did Danielle delete her account, or did that Slack alert come from a different DB?
-- READ ONLY. No writes, no DDL. Run ONE AT A TIME.
--
-- Established so far:
--   * NOT in public.users by user_id / id / username / email / referral_code
--   * NOT in auth.users at all (not even soft-deleted - no deleted_at row)
--   * ZERO auth.users orphans, so the ensure_public_user path is healthy
--   * ZERO signups anywhere on 2026-09-19
--   * Newest row in public.users is Jameer, 2026-09-15 20:58:53+00
--
-- Slack fired at 2026-09-19T14:52:13Z with public.users-only columns (username,
-- account_type, account_status, referral_code), so that row DID exist somewhere.


-- ---------------------------------------------------------------------------
-- 1. THE decisive query: Supabase's own auth audit log.
--    Look for her id, and for any delete action around 2026-09-19.
--    action values: user_signedup, user_deleted, login, logout, token_refreshed...
-- ---------------------------------------------------------------------------
SELECT
  id,
  created_at,
  payload ->> 'action'     AS action,
  payload ->> 'actor_id'   AS actor_id,
  payload ->> 'actor_name' AS actor_name,
  payload ->> 'actor_username' AS actor_username,
  payload ->> 'traits'     AS traits,
  payload
FROM auth.audit_log_entries
WHERE payload::text ILIKE '%d4153f28-78bc-44b9-ba00-5a23ff0e8921%'
   OR payload::text ILIKE '%dchristensen9@yahoo.com%'
   OR payload::text ILIKE '%danielle%'
ORDER BY created_at DESC;


-- ---------------------------------------------------------------------------
-- 2. Every auth event on 2026-09-19, whoever it was.
--    If this is empty, nothing authenticated against THIS database that day,
--    which means the Slack alert came from a different Supabase project.
-- ---------------------------------------------------------------------------
SELECT
  created_at,
  payload ->> 'action' AS action,
  payload ->> 'actor_id' AS actor_id,
  payload ->> 'actor_username' AS actor_username
FROM auth.audit_log_entries
WHERE created_at >= TIMESTAMPTZ '2026-09-19 00:00:00+00'
  AND created_at <  TIMESTAMPTZ '2026-09-20 00:00:00+00'
ORDER BY created_at DESC;


-- ---------------------------------------------------------------------------
-- 3. Any account deletion, ever. If she deleted, she shows here.
-- ---------------------------------------------------------------------------
SELECT
  created_at,
  payload ->> 'action' AS action,
  payload ->> 'actor_id' AS actor_id,
  payload ->> 'actor_username' AS actor_username
FROM auth.audit_log_entries
WHERE payload ->> 'action' IN ('user_deleted', 'user_recovery_requested', 'user_updated')
ORDER BY created_at DESC
LIMIT 50;


-- ---------------------------------------------------------------------------
-- 4. Is this database even the one Slack talks to?
--    Compare the newest auth user against the newest public.users row.
--    If auth.users also stops at 2026-09-15, this project never saw her.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM auth.users)                    AS auth_users_total,
  (SELECT count(*) FROM public.users)                  AS public_users_total,
  (SELECT max(created_at) FROM auth.users)             AS newest_auth_user,
  (SELECT max(created_at) FROM public.users)           AS newest_public_user,
  current_database()                                   AS database_name,
  inet_server_addr()                                   AS server_addr;


-- ---------------------------------------------------------------------------
-- 5. Recent auth signups regardless of public.users, last 14 days.
--    Shows whether ANY signup traffic is reaching this project.
-- ---------------------------------------------------------------------------
SELECT
  au.id,
  au.email,
  au.created_at,
  au.deleted_at,
  au.raw_app_meta_data ->> 'provider' AS provider,
  (SELECT count(*) FROM public.users pu WHERE pu.user_id = au.id) AS public_row
FROM auth.users au
WHERE au.created_at >= now() - INTERVAL '14 days'
ORDER BY au.created_at DESC;
