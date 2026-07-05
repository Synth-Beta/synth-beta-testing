-- DB integrity fixes, part 3 of 3: RLS per-row auth re-evaluation (audit 2026-07-03)
--
-- The Supabase performance advisor flags 157 row-level-security policies
-- across 51 tables (events, chat_participants, user_event_relationships,
-- notifications, ...) with the auth_rls_initplan lint: they call auth.uid()
-- (or auth.role()/auth.jwt()) directly, which Postgres re-evaluates FOR EVERY
-- ROW scanned. On a 248k-row table like events, that's 248k function calls
-- per query instead of 1.
--
-- The fix is the standard documented one: wrap the call as (select auth.uid())
-- so the planner evaluates it ONCE as an InitPlan and reuses the value.
--   https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- ZERO logic change: (select auth.uid()) returns exactly the same value as
-- auth.uid() -- who can see/modify what is completely unchanged. Only the
-- number of times the function is evaluated changes.
--
-- Rather than hand-writing 157 ALTER POLICY statements, this DO block rewrites
-- every affected policy mechanically from the catalog:
--   * targets only policies where auth.uid()/auth.role()/auth.jwt() appears
--     NOT already wrapped in a SELECT
--   * rewrites USING and WITH CHECK only where they exist on that policy
--   * policies already using the (select ...) form are skipped
-- It prints a NOTICE per rewritten policy so the run output is auditable.
--
-- Safe to run as one normal transaction. Re-running is harmless: after the
-- first run no policy matches the filter, so it rewrites nothing.

DO $$
DECLARE
  pol RECORD;
  new_qual TEXT;
  new_check TEXT;
  n INT := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '')       ~ 'auth\.(uid|role|jwt)\(\)'
        OR coalesce(with_check, '') ~ 'auth\.(uid|role|jwt)\(\)'
      )
      -- skip policies already using the InitPlan form
      AND coalesce(qual, '')       !~ 'SELECT auth\.'
      AND coalesce(with_check, '') !~ 'SELECT auth\.'
  LOOP
    new_qual  := regexp_replace(pol.qual,       'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    new_check := regexp_replace(pol.with_check, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');

    EXECUTE format(
      'ALTER POLICY %I ON %I.%I%s%s',
      pol.policyname, pol.schemaname, pol.tablename,
      CASE WHEN pol.qual       IS NOT NULL THEN format(' USING (%s)', new_qual)       ELSE '' END,
      CASE WHEN pol.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', new_check) ELSE '' END
    );

    n := n + 1;
    RAISE NOTICE 'rewrote policy % on %.%', pol.policyname, pol.schemaname, pol.tablename;
  END LOOP;

  RAISE NOTICE 'RLS initplan fix: rewrote % policies', n;
END $$;

-- Verify afterwards (should return 0):
--   SELECT count(*) FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (coalesce(qual,'') ~ 'auth\.(uid|role|jwt)\(\)'
--       OR coalesce(with_check,'') ~ 'auth\.(uid|role|jwt)\(\)')
--     AND coalesce(qual,'') !~ 'SELECT auth\.'
--     AND coalesce(with_check,'') !~ 'SELECT auth\.';
--
-- NOT done here: the advisor also reports 242 "multiple_permissive_policies"
-- warnings -- tables where several permissive policies exist for the same
-- role+action, each of which must be evaluated per query. Consolidating those
-- means merging policy conditions with OR, table by table, and needs a human
-- decision per table about intended access -- NOT a mechanical rewrite. Worth
-- a dedicated pass later; this file intentionally leaves them alone.
