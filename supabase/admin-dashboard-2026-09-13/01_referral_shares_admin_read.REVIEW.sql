-- referral_shares: let admins read every row (2026-09-13). STEP 0 + STEP 1 APPLIED 2026-09-13 by user.
-- STEP 0 output confirmed the diagnosis: only referral_shares_insert_own (a) and
-- referral_shares_select_own (r, "(SELECT auth.uid()) = user_id") existed; RLS enabled.
--
-- Problem: the admin dashboard's "Users · Shares" card and the "Weekly Shares" metric read
-- referral_shares through the anon key as the signed-in admin, so RLS applies. Production
-- has 22 share rows from 12 users (newest 2026-07-15), and the card renders blank — the
-- existing policies only expose a user's own rows. The client fetch also swallowed the
-- error, so it looked like "no shares" instead of "not allowed to see them" (that part is
-- fixed in the dashboard code; this file is what makes the data actually visible).
--
-- Admin test matches the rest of the schema (see supabase/perf-review-2026-07-12/
-- 02_consolidate_rls_policies.sql): users.account_type = 'admin'::account_type.
-- (SELECT auth.uid()) is wrapped so the planner evaluates it once per query, not per row.

-- ----------------------------------------------------------------------------
-- STEP 0 (read-only): what exists today. Run this first and read the output.
-- ----------------------------------------------------------------------------
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.referral_shares'::regclass
ORDER BY polname;

SELECT relrowsecurity AS rls_enabled
FROM pg_class
WHERE oid = 'public.referral_shares'::regclass;

-- ----------------------------------------------------------------------------
-- STEP 1: add an admin-only SELECT policy.
-- Postgres OR's permissive policies together, so this only widens reads for admins;
-- every existing policy keeps working unchanged for normal users.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can read all referral shares" ON public.referral_shares;

CREATE POLICY "Admins can read all referral shares"
  ON public.referral_shares
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'::account_type
    )
  );

-- ----------------------------------------------------------------------------
-- STEP 2 (verify): as an admin session this must return 22 (or the current total);
-- as a normal user it must return only that user's own rows.
--   SELECT count(*) FROM public.referral_shares;
-- ----------------------------------------------------------------------------
