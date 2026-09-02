-- =============================================================================
-- 03 — Security event log (read what Supabase already records)
-- Finding #18, security review 2026-09-01
-- =============================================================================
--
-- THE GAP: grep for security_events|audit_log|auth_audit|failed_login|login_attempt
--   across the repo returns zero matches. There is no way to answer "who logged
--   in from where", "how many failed logins last night", "who requested a
--   password reset" — and ErrorMonitoringService is disabled because its table
--   was never created.
--
-- WHY NO NEW TABLE: Supabase already writes every one of these events to
--   auth.audit_log_entries — logins, logouts, signups, password changes/recovery
--   requests, token refreshes, user deletions — with timestamp, actor and IP. It
--   is populated right now, retroactively, for events that already happened.
--   Building a second logging table would duplicate it and start from empty.
--
-- WHAT THIS FILE DOES: exposes that existing data to admins only, through one
--   SECURITY DEFINER function that matches the admin gate already used in
--   supabase/functions/newsletter-send/index.ts:87 and the admin edge functions
--   (account_type = 'admin'). auth.audit_log_entries is not directly reachable by
--   the client — and must not be made so, since it contains every user's email
--   and IP.
--
-- Run each numbered block separately.

-- -----------------------------------------------------------------------------
-- DRY RUN — confirm the data exists and see its shape before building anything.
--   Run this as the SQL editor (service role); it should already return rows.
-- -----------------------------------------------------------------------------
SELECT created_at,
       payload ->> 'action'         AS action,
       payload ->> 'actor_username' AS actor,
       ip_address
FROM auth.audit_log_entries
ORDER BY created_at DESC
LIMIT 25;

-- What action types does this project actually record?
SELECT payload ->> 'action' AS action, count(*) AS events,
       min(created_at) AS first_seen, max(created_at) AS last_seen
FROM auth.audit_log_entries
GROUP BY 1
ORDER BY events DESC;

-- -----------------------------------------------------------------------------
-- APPLY — admin-only reader.
--   SECURITY DEFINER so it can read the auth schema, with the admin check inside
--   so a non-admin caller gets an exception rather than data. search_path is
--   pinned per supabase/security-review-2026-07-10/03_function_search_path.sql.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_security_events(
  p_days  integer DEFAULT 7,
  p_limit integer DEFAULT 200,
  p_action text   DEFAULT NULL      -- e.g. 'login_failed', 'user_recovery_requested'
)
RETURNS TABLE (
  occurred_at timestamptz,
  action      text,
  actor       text,
  ip_address  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT (u.account_type = 'admin') INTO v_is_admin
  FROM public.users u
  WHERE u.user_id = auth.uid();

  IF COALESCE(v_is_admin, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT a.created_at,
         a.payload ->> 'action',
         a.payload ->> 'actor_username',
         a.ip_address::text          -- GoTrue stores this as varchar, not inet
  FROM auth.audit_log_entries a
  WHERE a.created_at > now() - make_interval(days => GREATEST(p_days, 1))
    AND (p_action IS NULL OR a.payload ->> 'action' = p_action)
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
END;
$$;

-- Admins call it with their own session; nobody else may reach it.
REVOKE EXECUTE ON FUNCTION public.get_security_events(integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_security_events(integer, integer, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_security_events(integer, integer, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- VERIFY
-- -----------------------------------------------------------------------------
-- As an admin session:      SELECT * FROM public.get_security_events(7, 50);
--                           -> rows
-- As a normal user session:  SELECT * FROM public.get_security_events();
--                           -> ERROR: Admin access required
-- As anon:                                       -> ERROR: permission denied

-- -----------------------------------------------------------------------------
-- USING IT — corrected 2026-09-01 against this project's ACTUAL audit data.
--
-- Two things I assumed that turned out to be false when the DRY RUN ran here:
--
--   1. There is no 'login_failed' action. GoTrue records successful `login` but
--      does NOT write failed password attempts to audit_log_entries. The complete
--      action set in this project is: token_refreshed, token_revoked, login,
--      logout, user_signedup, user_repeated_signup, user_deleted,
--      user_confirmation_requested, user_recovery_requested, user_modified.
--      So a "failed logins by IP" query returns nothing, always.
--
--   2. ip_address is empty on every row in this project. The column exists but
--      GoTrue is not populating it, so no IP-based clustering is possible here.
--
--   Failed-login visibility therefore is NOT available from this table. If you
--   want it, it has to come from the Supabase Auth logs in the dashboard
--   (Logs -> Auth), which are separate from audit_log_entries and have their own
--   shorter retention.
--
-- WHAT DOES WORK — queries matched to the data that actually exists:
-- -----------------------------------------------------------------------------
--
-- Repeated-signup attempts. This is the closest thing you have to an enumeration
-- signal: someone submitting signup for an email that already exists. 60 recorded
-- since 2025-10-02, mostly benign (users forgetting they registered), but a burst
-- in a short window is worth looking at.
--   SELECT * FROM public.get_security_events(7, 200, 'user_repeated_signup');
--
-- Password recovery requests (16 all-time here, so any cluster stands out):
--   SELECT * FROM public.get_security_events(7, 200, 'user_recovery_requested');
--
-- Account deletions, to confirm they match support requests:
--   SELECT * FROM public.get_security_events(30, 200, 'user_deleted');
--
-- Daily signup/login volume, as a baseline to notice deviations against:
--   SELECT date_trunc('day', occurred_at) AS day, action, count(*)
--   FROM public.get_security_events(30, 1000)
--   WHERE action IN ('login', 'user_signedup', 'user_deleted')
--   GROUP BY 1, 2 ORDER BY 1 DESC, 2;
--
-- Note that token_refreshed + token_revoked are ~95% of all rows (11.4K each) and
-- are just normal session rotation — filter them out rather than reading past them.

-- -----------------------------------------------------------------------------
-- NOTE ON RETENTION: Supabase prunes auth.audit_log_entries on its own schedule.
--   If you need longer history, copy it out on a pg_cron job rather than
--   widening client access to the auth schema.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.get_security_events(integer, integer, text);
