-- Expose each user's signup provider (Apple / Google / email) to admins only.
--
-- Supabase already records this automatically in auth.users.raw_app_meta_data->>'provider'
-- for every account (past and future) — this function just surfaces it safely to the
-- admin frontend, which only holds the anon key and cannot read the auth schema directly.

CREATE OR REPLACE FUNCTION public.get_user_signup_providers()
RETURNS TABLE (user_id uuid, signup_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_id = auth.uid()
      AND u.account_type = 'admin'::account_type
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    au.id AS user_id,
    CASE au.raw_app_meta_data ->> 'provider'
      WHEN 'apple' THEN 'apple'
      WHEN 'google' THEN 'android'
      WHEN 'email' THEN 'email'
      ELSE 'unknown'
    END AS signup_method
  FROM auth.users au;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_signup_providers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_signup_providers() TO authenticated;
