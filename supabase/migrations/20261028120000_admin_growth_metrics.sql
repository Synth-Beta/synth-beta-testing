-- Admin growth metrics: shares (in app vs outside), onboarding funnel, push reach,
-- music connections. Computed in the database so the admin page no longer downloads
-- raw rows (which silently capped at 1,000 per query) to count them.
--
-- Definitions
--   in-app share    messages.message_type IN ('event_share','review_share')  (sent to a friend in chat)
--   outside share   referral_shares row (share sheet / link out of the app). Web also logs an
--                   interactions 'share' row for the same tap, so interactions are NOT counted.
--   real user       users.is_bot is not true
--   funnel          real users who signed up in the last 30 days:
--                   signed up -> profile step (birthday set) -> followed an artist -> completed
--   push reach      real users who completed onboarding, with at least one active device token
--
-- ROLLBACK: DROP FUNCTION public.get_admin_growth_metrics();

CREATE OR REPLACE FUNCTION public.get_admin_growth_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery jsonb := NULL;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  -- push_delivery_log ships from supabase/push-reliability-2026-07-18; skip if not applied.
  IF to_regclass('public.push_delivery_log') IS NOT NULL THEN
    EXECUTE $q$
      SELECT jsonb_build_object(
        'sent_7d',   count(*) FILTER (WHERE status = 'sent'),
        'failed_7d', count(*) FILTER (WHERE status = 'failed')
      )
      FROM public.push_delivery_log
      WHERE created_at > now() - interval '7 days'
    $q$ INTO v_delivery;
  END IF;

  RETURN jsonb_build_object(
    'shares', jsonb_build_object(
      'in_app_7d', (SELECT count(*) FROM public.messages
                    WHERE message_type IN ('event_share', 'review_share') AND created_at > now() - interval '7 days'),
      'in_app_total', (SELECT count(*) FROM public.messages
                       WHERE message_type IN ('event_share', 'review_share')),
      'in_app_sharers_7d', (SELECT count(DISTINCT sender_id) FROM public.messages
                            WHERE message_type IN ('event_share', 'review_share') AND created_at > now() - interval '7 days'),
      'outside_7d', (SELECT count(*) FROM public.referral_shares WHERE shared_at > now() - interval '7 days'),
      'outside_total', (SELECT count(*) FROM public.referral_shares),
      'outside_sharers_7d', (SELECT count(DISTINCT user_id) FROM public.referral_shares
                             WHERE shared_at > now() - interval '7 days')
    ),

    'onboarding', (
      WITH recent AS (
        SELECT u.user_id,
               u.birthday IS NOT NULL AS did_profile,
               EXISTS (SELECT 1 FROM public.artist_follows af WHERE af.user_id = u.user_id) AS followed,
               u.onboarding_completed IS TRUE AS completed
        FROM public.users u
        WHERE NOT COALESCE(u.is_bot, false)
          AND u.created_at > now() - interval '30 days'
      )
      SELECT jsonb_build_object(
        'signed_up_30d', count(*),
        'profile_30d',   count(*) FILTER (WHERE did_profile),
        'followed_30d',  count(*) FILTER (WHERE followed),
        'completed_30d', count(*) FILTER (WHERE completed),
        'not_completed_all_time', (SELECT count(*) FROM public.users
                                   WHERE NOT COALESCE(is_bot, false) AND onboarding_completed IS NOT TRUE),
        'top_blocks_30d', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('reason', reason, 'users', users) ORDER BY users DESC, reason)
          FROM (
            SELECT replace(i.entity_id, 'onboarding_blocked_', '') AS reason,
                   count(DISTINCT i.user_id) AS users
            FROM public.interactions i
            WHERE i.entity_id LIKE 'onboarding\_blocked\_%'
              AND i.created_at > now() - interval '30 days'
            GROUP BY 1
            ORDER BY 2 DESC, 1
            LIMIT 5
          ) b
        ), '[]'::jsonb)
      )
      FROM recent
    ),

    'push', (
      WITH app_users AS (
        SELECT u.user_id FROM public.users u
        WHERE NOT COALESCE(u.is_bot, false) AND u.onboarding_completed IS TRUE
      )
      SELECT jsonb_build_object(
        'app_users', count(*),
        'with_token', count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.device_tokens d WHERE d.user_id = a.user_id AND d.is_active
        )),
        'delivery', v_delivery
      )
      FROM app_users a
    ),

    'music', jsonb_build_object(
      'spotify',        (SELECT count(DISTINCT user_id) FROM public.streaming_profiles WHERE service_type = 'spotify'),
      'apple_music',    (SELECT count(DISTINCT user_id) FROM public.streaming_profiles WHERE service_type = 'apple-music'),
      'lastfm',         (SELECT count(DISTINCT user_id) FROM public.streaming_profiles WHERE service_type = 'lastfm'),
      'spotify_export', (SELECT count(DISTINCT user_id) FROM public.streaming_profiles WHERE service_type = 'spotify-export'),
      'any',            (SELECT count(DISTINCT user_id) FROM public.streaming_profiles)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_growth_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_growth_metrics() TO authenticated;
