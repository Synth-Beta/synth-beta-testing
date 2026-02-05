-- ============================================================
-- Ensure new users get a user_preferences row on creation
-- ============================================================
-- When a row is inserted into public.users (via handle_new_user or
-- ensure_public_user_rpc), insert a default user_preferences row so
-- every user always has one.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_user_preferences_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_preferences (
    user_id,
    genre_preference_scores,
    artist_preference_scores,
    venue_preference_scores,
    top_genres,
    top_artists,
    top_venues,
    last_signal_at,
    signal_count,
    last_computed_at,
    updated_at
  )
  VALUES (
    NEW.user_id,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::text[],
    '{}'::uuid[],
    '{}'::uuid[],
    NULL::timestamptz,
    0,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'ensure_user_preferences_for_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ensure_user_preferences_on_user_insert ON public.users;
CREATE TRIGGER trigger_ensure_user_preferences_on_user_insert
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_user_preferences_for_new_user();

COMMENT ON FUNCTION public.ensure_user_preferences_for_new_user IS 'Inserts a default user_preferences row when a new user is added to public.users.';
