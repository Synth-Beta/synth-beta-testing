-- =============================================================================
-- SECURITY: ~100 SECURITY DEFINER functions in `public` are executable by anon
-- =============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
--
-- CONTEXT. 04 fixed 12 functions. Its STEP 4 sweep then showed the same
-- PUBLIC-grant blind spot across ~100 more. Nearly every one carries
-- `=X/postgres` (a grant to PUBLIC), so `REVOKE ... FROM anon` on any of them
-- would again be a silent no-op -- PUBLIC is what must be revoked.
--
-- These are SECURITY DEFINER: they execute as the owner with RLS bypassed. The
-- anon key ships in the client bundle, so "anon can execute" means "anyone on
-- the internet can POST to /rest/v1/rpc/<name>".
--
-- NOT ALL OF THESE ARE BUGS. Many are legitimately client-callable, which is
-- often the whole reason they are DEFINER (toggle_event_interest,
-- mark_notification_read, get_chat_participants ...). Bulk-revoking the list
-- would break the app. This file does only the two provably-safe passes and
-- leaves the rest to a per-function decision informed by STEP 1.
-- =============================================================================

-- ── STEP 1 (READ-ONLY) — which privileged functions actually guard themselves?
-- A SECURITY DEFINER function that never inspects auth.uid() / a role / a
-- permission check is relying entirely on GRANTs for authorization. For an
-- admin mutator reachable by `authenticated`, that is privilege escalation:
-- any signed-in user could call admin_set_account_type on themselves.
--
-- has_guard = false on any admin_* / review_* / moderate_* row is urgent.
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosrc ~* '(auth\.uid|auth\.role|user_has_permission|is_admin|account_type|current_setting\s*\(\s*''request\.jwt)' AS has_guard,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosecdef
  AND p.proname IN (
    'admin_set_account_type','admin_verify_user','admin_review_upgrade_request',
    'review_event_claim','review_event_promotion','moderate_content',
    'get_pending_admin_tasks','get_pending_flags_simple','promote_event',
    'auto_claim_creator_events','backfill_event_creation_analytics',
    'expire_promotions','upsert_jambase_event','safe_upsert_jambase_event',
    'populate_events_from_concerts','claim_event','flag_content',
    'calculate_user_trust_score','user_has_permission','admin_verify_user'
  )
ORDER BY has_guard, 1;


-- ── STEP 2 (SAFE BULK) — trigger functions should never be granted to anyone ─
-- A function returning `trigger` is invoked only by the trigger machinery, in
-- the table owner's context. PostgREST does not expose trigger functions as
-- RPC at all, so this cannot break a client call -- there is no client call to
-- break. This clears the ~25 notify_* / capture_* / trigger_* / update_*
-- entries out of the sweep so the remaining list is small enough to reason
-- about by hand.
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prorettype = 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Revoked PUBLIC/anon/authenticated EXECUTE on % trigger function(s).', n;
END $$;


-- ── STEP 3 (SAFE) — admin + ingestion mutators: drop anon, keep authenticated
-- An administrator is never anon, and the JamBase ingestion path runs as
-- service_role, so removing anon here cannot break a legitimate caller.
-- `authenticated` is deliberately RETAINED for now: if STEP 1 shows has_guard =
-- true the internal check is what gates these, and if it shows false you have a
-- privilege-escalation bug to fix in the function body -- revoking the grant
-- would mask it rather than fix it, and would break your real admin UI.
-- Decide that from STEP 1's output, not blindly here.
REVOKE EXECUTE ON FUNCTION public.admin_set_account_type(uuid, account_type, verification_level, subscription_tier) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_verify_user(uuid, boolean)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_upgrade_request(uuid, text, text)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_event_claim(uuid, boolean, text)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_event_promotion(uuid, boolean, text, text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.moderate_content(uuid, text, text, boolean)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pending_admin_tasks()                                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pending_flags_simple()                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.promote_event(uuid, text, timestamp with time zone, timestamp with time zone, text[], text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auto_claim_creator_events()                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.backfill_event_creation_analytics()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expire_promotions()                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_jambase_event(jsonb)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.safe_upsert_jambase_event(jsonb)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.populate_events_from_concerts()                            FROM PUBLIC, anon;


-- ── STEP 4 — what is left, for the per-function pass ────────────────────────
-- Everything still here is a non-trigger function anon can call. Expect the
-- legitimate client RPCs (toggle_event_interest, mark_notification_read,
-- get_chat_participants, ...). For each, the question is only: does it have a
-- genuine logged-out use case? If not, revoke PUBLIC + anon and keep
-- authenticated.
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosrc ~* '(auth\.uid|auth\.role|user_has_permission|is_admin)' AS has_guard,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosecdef
  AND p.prorettype <> 'trigger'::regtype
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY has_guard, 1;
