-- Danielle was deleted 5m15s after signup. Her auth + public.users rows are gone.
-- But rows in tables whose FK lacks ON DELETE CASCADE would SURVIVE - and her
-- interaction telemetry would name her platform and the last screen she reached.
-- READ ONLY. No writes, no DDL.
--
-- Timeline established from auth.audit_log_entries:
--   14:52:13.696  user_signedup (provider=email)
--   14:52:13.722  login
--   14:57:28.423  user_deleted (actor: service_role - ambiguous, see note below)
--
-- NOTE: api/delete-account.ts authenticates with the service role key, so a user
-- pressing "Delete Account" in the app logs IDENTICALLY to a manual dashboard
-- deletion. The audit log cannot separate them. Vercel logs can.


-- ---------------------------------------------------------------------------
-- 1. Did any of her telemetry survive the cascade?
--    entity_id 'onboarding_one_page'        -> she was on WEB
--    entity_id 'onboarding_profile'/'scene' -> she was on MOBILE
--    entity_id 'onboarding_blocked_<reason>'-> she hit a validation wall
-- ---------------------------------------------------------------------------
SELECT
  event_type,
  entity_type,
  entity_id,
  session_id,
  created_at
FROM public.interactions
WHERE user_id = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921'
ORDER BY created_at;


-- ---------------------------------------------------------------------------
-- 2. Which tables even retain rows after an auth user is deleted?
--    delete_rule = 'CASCADE'   -> her rows are gone
--    delete_rule = 'NO ACTION' -> her rows SURVIVE and are worth searching
-- ---------------------------------------------------------------------------
SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS references_schema,
  ccu.table_name   AS references_table,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema   = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema    = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
 AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'users'
  AND ccu.table_schema IN ('auth', 'public')
ORDER BY rc.delete_rule, tc.table_name;


-- ---------------------------------------------------------------------------
-- 3. Any other residue keyed to her id in the usual suspects.
--    Each returns 0 or more rows; non-zero means that table kept her data.
-- ---------------------------------------------------------------------------
SELECT 'interactions'  AS source_table, count(*) AS rows_kept
FROM public.interactions        WHERE user_id = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921'
UNION ALL
SELECT 'referral_shares', count(*)
FROM public.referral_shares     WHERE user_id = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921'
ORDER BY rows_kept DESC;


-- ---------------------------------------------------------------------------
-- 4. Context: how common is a same-day delete? Compare her 5m15s against
--    every other account that was deleted, using the audit log alone.
--    (The user rows are gone, so this is the only surviving record.)
-- ---------------------------------------------------------------------------
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS deletions
FROM auth.audit_log_entries
WHERE payload ->> 'action' = 'user_deleted'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 20;
