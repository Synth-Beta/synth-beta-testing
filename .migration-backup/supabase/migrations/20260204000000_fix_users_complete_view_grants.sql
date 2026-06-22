-- ============================================
-- FIX ADMIN PAGE: grants for users_complete view
-- ============================================
-- Symptom:
-- - Admin page / account type checks fail after switching to `users_complete`
--   because `authenticated` lacks SELECT privileges on the view and/or its
--   underlying tables.
--
-- Notes:
-- - RLS still applies on underlying tables and will restrict rows/columns.
-- - We intentionally do NOT grant these views to `anon`.
-- ============================================

BEGIN;

-- Ensure authenticated can access public schema objects.
GRANT USAGE ON SCHEMA public TO authenticated;

-- Underlying tables for the compatibility views.
GRANT SELECT ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.user_verifications TO authenticated;
GRANT SELECT ON TABLE public.user_subscriptions TO authenticated;

-- Compatibility views used by the app (including Admin dashboard).
GRANT SELECT ON TABLE public.users_with_verification TO authenticated;
GRANT SELECT ON TABLE public.users_with_subscription TO authenticated;
GRANT SELECT ON TABLE public.users_complete TO authenticated;

COMMIT;

