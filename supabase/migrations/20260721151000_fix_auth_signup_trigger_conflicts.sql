-- ============================================================================
-- Hotfix: stop auth signup failures from legacy trigger conflicts.
-- ============================================================================

BEGIN;

-- Legacy templates commonly install one of these auth.users triggers/functions.
-- If left in place after schema changes, they can throw and abort signup with:
-- "Database error saving new user".
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;
DROP TRIGGER IF EXISTS trigger_handle_new_user ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_new_user_v2();
DROP FUNCTION IF EXISTS public.handle_new_user_profile();

-- Keep signup resilient: even if profile provisioning hits an unexpected issue,
-- do not block auth.users creation.
CREATE OR REPLACE FUNCTION public.trigger_ensure_public_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public,auth,pg_catalog
AS $$
DECLARE
  fallback_name text;
  fallback_username text;
  has_email_column boolean;
BEGIN
  fallback_name := COALESCE(NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'Synth User');
  fallback_username := 'user_' || substring(NEW.id::text, 1, 8);
  has_email_column := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
  );

  BEGIN
    PERFORM public.ensure_public_user_for_user(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trigger_ensure_public_user primary path failed for %: %', NEW.id, SQLERRM;

    -- Fallback path mirrors Apple Sign In's known-good minimal profile payload.
    BEGIN
      IF has_email_column THEN
        INSERT INTO public.users (
          user_id,
          name,
          username,
          bio,
          moderation_status,
          is_public_profile,
          email,
          created_at,
          updated_at
        )
        VALUES (
          NEW.id,
          fallback_name,
          fallback_username,
          'Music lover looking to connect at events!',
          'good_standing',
          true,
          NEW.email,
          COALESCE(NEW.created_at, now()),
          now()
        )
        ON CONFLICT (user_id) DO NOTHING;
      ELSE
        INSERT INTO public.users (
          user_id,
          name,
          username,
          bio,
          moderation_status,
          is_public_profile,
          created_at,
          updated_at
        )
        VALUES (
          NEW.id,
          fallback_name,
          fallback_username,
          'Music lover looking to connect at events!',
          'good_standing',
          true,
          COALESCE(NEW.created_at, now()),
          now()
        )
        ON CONFLICT (user_id) DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trigger_ensure_public_user fallback also failed for %: %', NEW.id, SQLERRM;
    END;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ensure_public_user ON auth.users;
CREATE TRIGGER trigger_ensure_public_user
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ensure_public_user();

COMMIT;
