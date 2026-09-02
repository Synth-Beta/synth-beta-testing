-- =============================================================================
-- 04 — Database permissions audit (READ-ONLY, changes nothing)
-- Finding #20, security review 2026-09-01
-- =============================================================================
--
-- STATE GOING IN — already applied in previous rounds:
--   RLS consolidated across all 19 tables  (perf-review-2026-07-12/02)
--   search_path pinned on functions        (security-review-2026-07-10/03)
--   anon EXECUTE revoked on 35 functions   (security-review-2026-07-10/04)
--   get_email_by_username                  (this round, file 01)
--
-- Every statement below is a SELECT. Run the whole file, then act on any query
-- that returns rows. Nothing here modifies the database.

-- -----------------------------------------------------------------------------
-- Q1 — Tables in `public` with RLS DISABLED.
--   Any row here is readable/writable by anyone with the anon key, full stop.
--   Expect: 0 rows.
-- -----------------------------------------------------------------------------
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY 1;

-- -----------------------------------------------------------------------------
-- Q2 — Tables with RLS ENABLED but ZERO policies.
--   RLS on with no policy denies everything to anon/authenticated, so this is
--   fail-closed, not a hole — but it usually means a feature is silently broken
--   or a policy got dropped. Worth eyeballing.
-- -----------------------------------------------------------------------------
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY 1;

-- -----------------------------------------------------------------------------
-- Q3 — Policies that grant access to the `anon` role.
--   Each of these is reachable by anyone on the internet with the shipped anon
--   key. Some are legitimate (public event listings, venue data, artists).
--   Review the list and confirm every entry is meant to be world-readable —
--   pay attention to anything touching users, chats, messages, notifications,
--   reviews-in-draft, or streaming/preference data.
-- -----------------------------------------------------------------------------
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
ORDER BY tablename, policyname;

-- -----------------------------------------------------------------------------
-- Q4 — Any remaining SECURITY DEFINER function still executable by anon.
--   SECURITY DEFINER runs as the owner and bypasses RLS, so an anon-callable one
--   is a privilege boundary. Expect only the deliberate pre-login helpers
--   (check_username_available, and trigger functions which aren't API-callable).
--   get_email_by_username must NOT appear after file 01.
-- -----------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef                                AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- Q5 — Direct table-level grants to anon/authenticated.
--   Supabase grants broadly by default and relies on RLS to constrain it, so
--   rows here are expected. This exists to spot the outlier: an anon INSERT,
--   UPDATE or DELETE on a table that should be read-only to logged-out users.
-- -----------------------------------------------------------------------------
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS anon_write_privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
GROUP BY table_name
ORDER BY table_name;

-- -----------------------------------------------------------------------------
-- Q6 — Views owned by a superuser / postgres that bypass RLS.
--   A view runs with its owner's rights unless created WITH (security_invoker=on).
--   A postgres-owned view over an RLS-protected table hands out unfiltered rows.
-- -----------------------------------------------------------------------------
SELECT c.relname AS view_name,
       pg_get_userbyid(c.relowner) AS owner,
       COALESCE(
         (SELECT option_value FROM pg_options_to_table(c.reloptions)
          WHERE option_name = 'security_invoker'),
         'off'
       ) AS security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
ORDER BY 1;

-- -----------------------------------------------------------------------------
-- Q7 — Leftover work/backup tables flagged in earlier rounds.
--   Confirm what still exists before dropping anything. Known candidates from
--   your notes: venue_dedup_map, _venue_canon, _venue_canon_unique,
--   users_backup_20260715, event_dedup_map, events_dedup_backup (keep as audit).
--   Backup tables of `users` are the ones that matter here — they hold real PII
--   and are easy to forget when auditing RLS.
-- -----------------------------------------------------------------------------
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND (c.relname LIKE '%backup%' OR c.relname LIKE '%dedup%' OR c.relname LIKE '\_%')
ORDER BY pg_total_relation_size(c.oid) DESC;
