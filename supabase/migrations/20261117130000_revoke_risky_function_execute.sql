-- Security audit 2026-11-17: SECURITY DEFINER functions that logged-out visitors (anon) could
-- call through the public API. SECURITY DEFINER skips RLS, so these must not be open.
--
-- Locked to the server only (service_role / pg_cron); no app or admin-portal code calls them:
--   seo_prune                 deletes old SEO rows (called by the daily cron as service_role)
--   refresh_entity_rarity     heavy recompute
--   backfill_passport_stamps  heavy backfill
-- Logged-out access removed, logged-in kept:
--   seo_dashboard             admin portal (already checks seo_is_admin, this is defence in depth)
--   user_partner_connections  per-user data, nothing to show a logged-out visitor
--
-- Deliberately left callable by anon (public pages need them): get_invite (invite landing),
-- get_review_engagement, seo_event_interest_counts, seo_review_snippets, seo_is_admin.
-- The trigger functions in the same audit list cannot be called through the API, so they are
-- left alone.

REVOKE EXECUTE ON FUNCTION public.seo_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_prune() TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_entity_rarity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_entity_rarity() TO service_role;

REVOKE EXECUTE ON FUNCTION public.backfill_passport_stamps() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_passport_stamps() TO service_role;

REVOKE EXECUTE ON FUNCTION public.seo_dashboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_dashboard(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.user_partner_connections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_partner_connections() TO authenticated;
