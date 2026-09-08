-- =============================================================================
-- Drop four dead admin functions. 2026-09-07.
-- =============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
--
-- These are the "three non-security bugs" from the anon-execute sweep, plus one
-- more found alongside them. All four are BROKEN AND UNREACHABLE — every one
-- raises at runtime, and after the client fix below nothing calls any of them.
--
--   get_pending_flags_simple()   42P01  relation "public.profiles" does not exist
--   get_user_account_info(uuid)  42P01  same
--   get_pending_admin_tasks()    42P01  same
--   get_users_for_admin()        stub — body is literally
--                                       `BEGIN -- Your implementation here END;`
--
-- public.profiles was replaced by public.users at some point and these were
-- never updated. Verified live 2026-09-07 by calling each as service_role.
--
-- WHY DROP RATHER THAN REPAIR. None of them has a caller:
--   * get_user_account_info — src/hooks/useAccountType.ts reads the
--     users_complete view directly, not this RPC.
--   * get_pending_flags_simple / get_pending_admin_tasks / get_users_for_admin —
--     reached only via AdminService.getPendingFlags / .getPendingTasks /
--     .getAllFlags, and no component calls those. The admin UI
--     (src/components/admin/AdminModerationPanel.tsx) queries moderation_flags
--     directly.
-- Repairing four functions nobody calls adds surface without adding behaviour.
--
-- ALSO FIXED, in code, same day — the moderation_flags rename had broken every
-- consumer, not just these functions:
--   src/services/adminService.ts
--     - getPendingFlags: dropped two RPC attempts that could never succeed
--       (get_pending_moderation_flags does not exist at all, PGRST202;
--       get_pending_flags_simple raises 42P01) and fixed the final fallback,
--       which was filtering on `flag_status` — a column that does not exist.
--       All three layers failed, so the queue was permanently empty.
--     - reviewFlag: the UPDATE named all six pre-rename columns, so actioning
--       a flag failed and the queue could never be cleared.
--     - new exported MODERATION_FLAG_SELECT aliases the real columns back to
--       the names the UI expects.
--   src/components/admin/AdminModerationPanel.tsx — three queries fixed.
--
-- Column rename, for reference:
--   flag_status          -> status
--   flag_details         -> additional_details
--   reviewed_by_admin_id -> resolved_by_user_id
--   reviewed_at          -> resolved_at
--   review_notes         -> resolution_notes
--   action_taken         -> resolution_action
--
-- Content REPORTING was never broken: src/services/contentModerationService.ts
-- already inserts additional_details/status correctly. Users could file reports;
-- no admin could read or action them.
-- =============================================================================

-- ── STEP 1 (READ-ONLY) — last check that nothing in the DB calls them ───────
-- Expect 0 rows. A hit means some other function or view depends on one of
-- these, and you should stop and look before dropping.
SELECT p.oid::regprocedure AS calling_function
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname NOT IN ('get_pending_flags_simple','get_user_account_info',
                        'get_pending_admin_tasks','get_users_for_admin')
  AND p.prosrc ~* '(get_pending_flags_simple|get_user_account_info|get_pending_admin_tasks|get_users_for_admin)'
ORDER BY 1;

SELECT n.nspname || '.' || c.relname AS depending_view
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v','m')
  AND pg_get_viewdef(c.oid) ~* '(get_pending_flags_simple|get_user_account_info|get_pending_admin_tasks|get_users_for_admin)';


-- ── STEP 2 — drop. Only if STEP 1 returned nothing. ────────────────────────
-- Reversible in the sense that all four are recoverable from git history of
-- this audit folder / the 07 dump, but three of them are broken and the fourth
-- is empty, so there is nothing worth restoring.
DROP FUNCTION IF EXISTS public.get_pending_flags_simple();
DROP FUNCTION IF EXISTS public.get_user_account_info(uuid);
DROP FUNCTION IF EXISTS public.get_pending_admin_tasks();
DROP FUNCTION IF EXISTS public.get_users_for_admin();


-- ── STEP 3 — verify. Expect 0 rows. ────────────────────────────────────────
SELECT p.oid::regprocedure AS still_present
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('get_pending_flags_simple','get_user_account_info',
                    'get_pending_admin_tasks','get_users_for_admin');


-- ── OPTIONAL — the leftover from 06, once you are happy with it ────────────
-- Keep it at least a full release cycle; it is the rollback map for the 218
-- anon revokes.
--   DROP TABLE public._anon_execute_backup_20260907;
