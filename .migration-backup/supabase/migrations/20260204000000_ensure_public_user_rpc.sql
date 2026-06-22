-- ============================================================
-- ensure_public_user RPC
-- ============================================================
-- Fallback for when handle_new_user trigger fails: creates public.users
-- row for the current authenticated user. Called from OnboardingService
-- when onboarding runs. SECURITY DEFINER bypasses RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_public_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid := auth.uid();
  v_name text;
  v_username text;
BEGIN
  IF v_auth_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = v_auth_id) THEN RETURN; END IF;

  SELECT COALESCE(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    SPLIT_PART(email, '@', 1),
    'user'
  ) INTO v_name
  FROM auth.users WHERE id = v_auth_id;

  v_username := public.generate_available_username(v_name, v_auth_id);

  INSERT INTO public.users (user_id, name, username, bio, moderation_status, is_public_profile, created_at, updated_at)
  VALUES (v_auth_id, v_name, v_username, 'Music lover looking to connect at events!', 'good_standing', true, NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_public_user() TO authenticated;

COMMENT ON FUNCTION public.ensure_public_user() IS
'Creates public.users row for current user if missing. Fallback when handle_new_user trigger fails. Idempotent.';
