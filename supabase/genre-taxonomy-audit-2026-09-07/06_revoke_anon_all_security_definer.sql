-- =============================================================================
-- Remove anon EXECUTE from every SECURITY DEFINER function in `public`
-- =============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
-- RUN 05 (STEP 2 + STEP 3) FIRST — this supersedes neither; it generalises them.
--
-- WHY BLANKET IS SAFE HERE. Every one of these runs as the owner with RLS
-- bypassed, and the anon key ships in the client bundle. A repo-wide grep of
-- `supabase.rpc('...')` across src/, mobile/, packages/, backend/, api/ and
-- scripts/ found 91 distinct RPCs in use and **not one is called from a
-- logged-out path** — `ensure_public_user` runs after signup with a session,
-- everything else sits behind auth. So `anon` needs none of them.
--
-- `authenticated` and `service_role` are untouched, so the app and the Express
-- backend are unaffected. pg_cron runs as `postgres` (the owner) and ignores
-- GRANTs entirely.
--
-- Most of the ~200 are unguarded reads/writes that take a user_id parameter and
-- never check auth.uid(). Under SECURITY DEFINER that means anon can pass ANY
-- user's id. Worst of what the sweep surfaced:
--   get_users_for_admin(), get_all_profiles_for_analytics()  -> whole user table
--   get_user_draft_reviews / delete_review_draft / publish_review_draft
--                                                            -> anyone's unpublished drafts
--   get_user_account_info(uuid)                              -> arbitrary user PII
--   add_user_to_verified_chat / join_verified_chat           -> chat membership
--   unlock_passport_* , track_* (~30)                        -> write signals as any user
--   check_username_available(text)                           -> the username->email oracle
--                                                               flagged 2026-09-01 (0 callers)
--
-- Fixing each body to check auth.uid() is the correct long-term answer. This is
-- the tourniquet: it costs nothing and removes the unauthenticated surface today.
-- =============================================================================

-- ── STEP 1. Snapshot first, so the rollback is exact. ───────────────────────
DROP TABLE IF EXISTS public._anon_execute_backup_20260907;
CREATE TABLE public._anon_execute_backup_20260907 AS
SELECT
  p.oid::regprocedure::text AS function_signature,
  p.proacl::text            AS acl_before,
  now()                     AS captured_at
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE');

SELECT count(*) AS functions_about_to_change FROM public._anon_execute_backup_20260907;


-- ── STEP 2. Revoke. PUBLIC is the one that matters; anon is named for the ───
-- handful carrying an explicit `anon=X/postgres` grant as well.
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Revoked PUBLIC/anon EXECUTE on % SECURITY DEFINER function(s).', n;
END $$;


-- ── STEP 3. Verify state, not "it ran without error". ──────────────────────
-- Expect 0. This is the assertion the 2026-07-10 migration never made, which is
-- why it read as applied for two months while changing nothing.
SELECT count(*) AS anon_executable_security_definer_expect_0
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- And confirm authenticated was NOT collateral damage — this should still be a
-- large number, and the app's 91 RPCs must be in it.
SELECT count(*) AS still_callable_by_authenticated
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE');


-- ── STEP 4. Rollback, if something logged-out turns out to need one. ───────
-- Symptom would be a 42501 "permission denied for function ..." from a signed-out
-- client. Restore just that one:
--     GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO anon;
--
-- Everything that changed is listed here with its original ACL:
--     SELECT * FROM public._anon_execute_backup_20260907 ORDER BY function_signature;
--
-- Drop the snapshot once you're satisfied (keep it at least a full release cycle):
--     DROP TABLE public._anon_execute_backup_20260907;
