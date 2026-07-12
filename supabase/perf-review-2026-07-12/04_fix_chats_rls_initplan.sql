-- =============================================================================
-- 04 — Fix auth_rls_initplan on chats_insert_policy  (Finding 5, tiny)
-- =============================================================================
--
-- This policy came from the security review (01_chats_insert_policy). Written as
-- `auth.uid() IS NOT NULL`, Postgres re-evaluates auth.uid() once PER ROW. Wrapping
-- it in a scalar subquery `(SELECT auth.uid())` makes the planner evaluate it once
-- per statement (init-plan). Same behavior, less per-row cost. The other chats
-- policies already use this wrapped form.
--
-- -----------------------------------------------------------------------------
-- DRY RUN
-- -----------------------------------------------------------------------------
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='chats' AND policyname='chats_insert_policy';

-- -----------------------------------------------------------------------------
-- APPLY
-- -----------------------------------------------------------------------------
ALTER POLICY chats_insert_policy ON public.chats
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- -----------------------------------------------------------------------------
-- VERIFY — with_check should now read ((SELECT auth.uid()) IS NOT NULL)
--   Sending a chat message / creating a DM should still work.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- ALTER POLICY chats_insert_policy ON public.chats WITH CHECK (auth.uid() IS NOT NULL);
