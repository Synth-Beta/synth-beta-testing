-- =============================================================================
-- READ-ONLY. Dump the bodies of the functions that still trust a caller-supplied
-- user_id, so guarded replacements can be written against the real source.
-- =============================================================================
-- WHERE WE ARE. 06 is applied: 218 SECURITY DEFINER functions no longer grant
-- anon, verified end-to-end with the real public anon key (get_users_for_admin
-- and get_all_profiles_for_analytics both return 42501). 234 remain callable by
-- `authenticated`, which is correct — the app needs them.
--
-- WHAT IS STILL BROKEN. Most of those 234 are SECURITY DEFINER (RLS bypassed)
-- and take a user_id as a PARAMETER without ever comparing it to auth.uid().
-- Any signed-in user can therefore act as any other user. This is IDOR, and the
-- revoke did nothing about it — it only removed the unauthenticated surface.
--
-- These functions are not in the repo (Replit-era, DB-only), so their bodies
-- have to come out of the catalog before they can be rewritten.
-- pg_get_functiondef returns a complete CREATE OR REPLACE statement, which is
-- exactly what a guarded version has to be built from.
--
-- Run it, paste the output back. If it's too large for one go, run it in three
-- batches by commenting out parts of the IN list.
-- =============================================================================

SELECT
  p.oid::regprocedure AS function_signature,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    -- Batch A — private user content. Highest severity: draftReviewService.ts
    -- passes a user_id straight through, so today any signed-in user can read,
    -- overwrite, publish or delete another user's unpublished drafts.
    'get_user_draft_reviews','save_review_draft','publish_review_draft','delete_review_draft',

    -- Batch B — PII and whole-table reads. Both are called from real admin/
    -- analytics screens (adminService.ts, analyticsDataService.ts), so they
    -- need a guard, NOT a revoke — revoking breaks those screens.
    'get_users_for_admin','get_all_profiles_for_analytics','get_user_account_info',
    'get_pending_flags_simple',

    -- Batch C — chat membership. Adding an arbitrary user to a chat is a
    -- privacy problem even without message access.
    'add_user_to_verified_chat','join_verified_chat'
  )
ORDER BY p.proname;


-- =============================================================================
-- THE GUARD THAT GOES IN. For reference — do not run this, it is a template.
-- =============================================================================
-- For a function whose only flaw is trusting p_user_id, the fix is a prepend to
-- the body, keeping everything else byte-identical:
--
--   IF auth.uid() IS NULL THEN
--     RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
--   END IF;
--   IF p_user_id IS DISTINCT FROM auth.uid() THEN
--     RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--   END IF;
--
-- For the admin-scoped ones (get_users_for_admin, get_all_profiles_for_analytics,
-- get_pending_flags_simple) the second test becomes a role check instead. Note
-- that user_has_permission(uuid, text) is itself SECURITY DEFINER and does carry
-- an internal guard, so it is safe to call from inside these:
--
--   IF NOT public.user_has_permission(auth.uid(), 'admin') THEN
--     RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--   END IF;
--
-- 42501 is deliberate: PostgREST maps it to HTTP 403, and supabase-js surfaces
-- it as error.code '42501' — distinguishable from a genuine empty result, which
-- is how this class of bug stayed invisible in the first place.
--
-- Each replacement must also keep the function's existing SET search_path and
-- SECURITY DEFINER attributes. pg_get_functiondef includes them; preserve them
-- verbatim rather than retyping.
