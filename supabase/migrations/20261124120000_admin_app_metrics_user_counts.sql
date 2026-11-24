-- Admin "Users" cards: replaces the app-opens / nudges / reviews / newsletter / Calendar
-- counts from 20261020120000_admin_app_metrics.sql with who the users are.
--
-- Definitions (same as get_admin_growth_metrics)
--   bot           users.is_bot is true
--   real user     users.is_bot is not true
--   finished      real user with users.onboarding_completed true
--   active 7d     real user with a user_app_opens row in the last 7 days
--
-- ROLLBACK: re-run 20261020120000_admin_app_metrics.sql.

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

  RETURN (
    SELECT jsonb_build_object(
      'total_users', count(*),
      'bots', count(*) FILTER (WHERE COALESCE(u.is_bot, false)),
      'real_users', count(*) FILTER (WHERE NOT COALESCE(u.is_bot, false)),
      'onboarded', count(*) FILTER (WHERE NOT COALESCE(u.is_bot, false) AND u.onboarding_completed IS TRUE),
      'not_onboarded', count(*) FILTER (WHERE NOT COALESCE(u.is_bot, false) AND u.onboarding_completed IS NOT TRUE),
      'active_7d', (
        SELECT count(DISTINCT o.user_id)
        FROM public.user_app_opens o
        JOIN public.users ru ON ru.user_id = o.user_id
        WHERE o.opened_at > now() - interval '7 days' AND NOT COALESCE(ru.is_bot, false)
      )
    )
    FROM public.users u
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_app_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_app_metrics() TO authenticated;
