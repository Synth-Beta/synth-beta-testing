-- Security audit 2026-11-17, Supabase check #2: users must not be able to make themselves admin.
--
-- The users UPDATE policy lets a logged-in user update their own row, so without this a
-- user could run `supabase.from('users').update({ account_type: 'admin' })` from the browser
-- console. Column-level REVOKE is fragile here (a table-level UPDATE grant overrides it), so
-- a BEFORE UPDATE trigger rejects any change to privileged columns made directly by a client.
--
-- Not affected:
--   * admin_set_account_type and other SECURITY DEFINER RPCs (they run as their owner, not
--     as `authenticated`), so the admin portal keeps working.
--   * service_role (API routes, cron, backend) and the SQL editor.
--   * Client updates that leave these columns unchanged (e.g. profile edits sending the
--     whole row): only an actual change is rejected.
-- Columns that do not exist are skipped (to_jsonb returns null for both sides).
--
-- PRE-CHECK before applying (the admin RPCs are not defined in this repo). Every row must
-- show prosecdef = true, or the admin portal's account-type/verify actions would be blocked:
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE proname IN ('admin_set_account_type', 'admin_verify_user', 'admin_review_upgrade_request');

CREATE OR REPLACE FUNCTION public.guard_users_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  col text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  FOREACH col IN ARRAY ARRAY['account_type', 'subscription_tier', 'verified', 'verification_level', 'business_info'] LOOP
    IF (to_jsonb(NEW) -> col) IS DISTINCT FROM (to_jsonb(OLD) -> col) THEN
      RAISE EXCEPTION 'Not allowed to change users.%', col USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_users_privileged_columns ON public.users;
CREATE TRIGGER guard_users_privileged_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_users_privileged_columns();

-- Verify (run as a normal logged-in user from the app console; expect error 42501):
--   await supabase.from('users').update({ account_type: 'admin' }).eq('user_id', '<your id>')
