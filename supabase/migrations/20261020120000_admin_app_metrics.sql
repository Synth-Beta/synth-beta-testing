-- Admin metrics for the 1.5 app layout (app opens, week-1 nudges, public reviews,
-- hidden ticket prices, hidden artists, newsletter, Calendar).
-- user_app_opens and user_artist_exclusions are not readable by the admin client
-- under RLS, so this returns aggregates only, to admins only.
-- ROLLBACK: DROP FUNCTION public.get_admin_app_metrics();

CREATE OR REPLACE FUNCTION public.get_admin_app_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'opens_since', (SELECT min(opened_at) FROM public.user_app_opens),
    'open_dau', (SELECT count(DISTINCT user_id) FROM public.user_app_opens WHERE opened_at > now() - interval '1 day'),
    'open_wau', (SELECT count(DISTINCT user_id) FROM public.user_app_opens WHERE opened_at > now() - interval '7 days'),
    'open_mau', (SELECT count(DISTINCT user_id) FROM public.user_app_opens WHERE opened_at > now() - interval '30 days'),
    'week1_nudges_7d', (SELECT count(*) FROM public.notifications WHERE type = 'week1_nudge' AND created_at > now() - interval '7 days'),
    'week1_nudges_read_7d', (SELECT count(*) FROM public.notifications WHERE type = 'week1_nudge' AND is_read AND created_at > now() - interval '7 days'),
    'public_reviews_7d', (SELECT count(*) FROM public.reviews WHERE NOT is_draft AND COALESCE(is_public, true) AND created_at > now() - interval '7 days'),
    'public_reviews_total', (SELECT count(*) FROM public.reviews WHERE NOT is_draft AND COALESCE(is_public, true)),
    'reviews_hiding_price', (SELECT count(*) FROM public.reviews WHERE NOT is_draft AND NOT show_ticket_price),
    'artist_exclusions', (SELECT count(*) FROM public.user_artist_exclusions),
    'users_hiding_artists', (SELECT count(DISTINCT user_id) FROM public.user_artist_exclusions),
    'newsletter_subscribed', (SELECT count(*) FROM public.users WHERE newsletter_subscription = 'subscribed'),
    'calendar_opens_7d', (SELECT count(*) FROM public.interactions WHERE entity_id = 'side_menu_calendar' AND created_at > now() - interval '7 days')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_app_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_app_metrics() TO authenticated;
