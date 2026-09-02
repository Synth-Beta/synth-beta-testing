-- =============================================================================
-- 01 — Close the username → email disclosure oracle
-- Finding #5, security review 2026-09-01
-- =============================================================================
--
-- THE PROBLEM:
--   public.get_email_by_username(text) is EXECUTE-able by the `anon` role. The
--   anon key ships inside every client bundle, so ANY unauthenticated caller can
--   resolve a public username to that user's email address — and loop it over the
--   public username list (profiles, chat, reviews) to harvest the entire user
--   base. That is bulk PII disclosure, not just account enumeration, and it feeds
--   credential stuffing and targeted phishing at the password-reset flow.
--
-- WHY IT WAS LEFT OPEN, AND WHY THAT REASON IS WRONG:
--   supabase/security-review-2026-07-10/04_revoke_anon_execute_privileged_functions.sql
--   deliberately preserved it (line 15: "get_email_by_username -> username-based
--   login"). That flow does not exist. Login is email + password only:
--     src/pages/Auth.tsx:189             signInWithPassword({ email, password })
--     mobile/app/(auth)/sign-in.tsx:87   signInWithPassword({ email, password })
--     apps/admin/src/pages/Auth.tsx:58   signInWithPassword({ email, password })
--   and grep across web + mobile + admin + backend + api/ finds ZERO callers of
--   the RPC. It is dead code holding an open PII oracle.
--
-- WHY NO APP CHANGE IS NEEDED:
--   Nothing calls it. Revoking cannot break a code path that does not exist.
--   check_username_available(text) is NOT touched — signup genuinely needs it
--   before a session exists, and it returns a boolean, not PII.
--
-- ORDER OF OPERATIONS: run the DRY RUN, confirm zero dependencies, then APPLY.
--   Run each numbered block separately — the Supabase web editor wraps a
--   multi-statement paste in one transaction.

-- -----------------------------------------------------------------------------
-- DRY RUN 1 — current grants. Expect anon_can_exec = true (the hole).
-- -----------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid)                 AS args,
       has_function_privilege('anon', p.oid, 'EXECUTE')           AS anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS auth_can_exec,
       p.prosecdef                                                AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_email_by_username', 'check_username_available')
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- DRY RUN 2 — is anything in the DB itself calling it? (other functions,
--   triggers, views). Expect 0 rows from both queries. If either returns rows,
--   STOP and read them: the REVOKE below is still safe either way, but the
--   OPTIONAL DROP at the end would not be.
--
--   NOTE: this reads pg_proc.prosrc (a plain column) rather than calling
--   pg_get_functiondef(), which raises 42809 on aggregate/window functions —
--   Postgres may evaluate it before the schema filter and hit array_agg.
-- -----------------------------------------------------------------------------
SELECT n.nspname AS schema, p.proname AS calling_function
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind IN ('f', 'p')                        -- regular functions + procedures only
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND p.proname <> 'get_email_by_username'
  AND p.prosrc ILIKE '%get_email_by_username%';

-- Views referencing it (separate catalog, same question):
SELECT schemaname, viewname
FROM pg_views
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND definition ILIKE '%get_email_by_username%';

-- -----------------------------------------------------------------------------
-- APPLY (primary fix) — revoke EXECUTE from anon AND authenticated, for every
--   overload. Reversible, idempotent, overload-safe. This alone closes the hole.
--   The service role is unaffected by GRANTs, so any server-side use keeps working.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_email_by_username'
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon;',
                     r.proname, r.args);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated;',
                     r.proname, r.args);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC;',
                     r.proname, r.args);
      RAISE NOTICE 'Revoked: %(%)', r.proname, r.args;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped %(%): %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- VERIFY — re-run DRY RUN 1. Expect:
--   get_email_by_username     anon_can_exec = false, auth_can_exec = false
--   check_username_available  anon_can_exec = true   (unchanged, still needed)
-- Then smoke test: sign up (username availability check still works), sign in,
-- password reset. None of them touch the revoked function.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- OPTIONAL cleanup — only after DRY RUN 2 returned 0 rows and the app has been
--   verified above. Deletes the dead function outright so the grant can never be
--   reinstated by accident. Skip this if you prefer to keep it revoked-but-present.
-- -----------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.get_email_by_username(text);

-- -----------------------------------------------------------------------------
-- IF YOU EVER WANT USERNAME LOGIN BACK — do NOT re-grant this function. The
--   email must never be returned to an untrusted client. Build it as one
--   server-side step instead: an edge function that takes { username, password },
--   resolves the email with the service role, calls signInWithPassword, and
--   returns only the session. Same shape as the admin gate in
--   supabase/functions/newsletter-send/index.ts:70.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- ROLLBACK (if some unknown caller surfaces — prefer fixing that caller instead)
-- -----------------------------------------------------------------------------
-- GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon;
