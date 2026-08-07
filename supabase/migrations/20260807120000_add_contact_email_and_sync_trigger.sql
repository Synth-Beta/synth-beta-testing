-- Add a plain, non-auth-linked contact email field for safety/abuse-report purposes.
-- Deliberately NOT routed through Supabase Auth's email/confirmation flow — this
-- project has "Confirm email change" ON, so supabase.auth.updateUser({ email })
-- would not apply until a confirmation link is clicked, which is incompatible with
-- a required, blocking gate. This column is written/read directly instead.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS contact_email text;

-- Bundled fix: public.users.email drifts from auth.users.email today (Settings'
-- "Change Email" flow only updates auth.users.email, never public.users.email).
-- Backfill existing rows (additive only, never overwrites an existing value):
UPDATE public.users u
SET email = a.email
FROM auth.users a
WHERE u.user_id = a.id
  AND u.email IS NULL
  AND a.email IS NOT NULL;

-- Keep public.users.email in sync going forward.
CREATE OR REPLACE FUNCTION public.sync_public_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_public_user_email ON auth.users;
CREATE TRIGGER trigger_sync_public_user_email
AFTER UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_user_email();
