-- ============================================================================
-- Populate public.users.signup_platform automatically on signup.
--
-- Root cause: nothing in this repo's application code (web src/pages/Auth.tsx,
-- mobile app/(auth)/sign-in.tsx, AndroidGoogleSignInRow.tsx) ever wrote
-- signup_platform, and the public.users-provisioning trigger
-- (ensure_public_user_for_user / trigger_ensure_public_user) never read it
-- either. Every new user signs up through that one trigger, so deriving
-- signup_platform there once covers every current and future signup surface
-- instead of patching each client call site.
--
-- IMPORTANT: this migration targets the function definitions as they
-- currently exist in production, i.e. after the full fix chain in
-- supabase/onboarding-signup-fix-2026-07-27/ (01-04), NOT the original
-- 20260716130000/20260721151000 versions. A first draft of this migration
-- was written against those original (superseded) versions and failed with
-- "cannot change return type of existing function" because the live
-- ensure_public_user_for_user() OUT params are (result_user_id, inserted,
-- error) - renamed from (user_id, inserted, error) in
-- 04_fix_ambiguous_column.sql to fix a column-ambiguity bug - and it reads
-- target.raw_user_meta_data, not target.user_metadata (never a real column).
-- Live public.users also has no moderation_status/warning_count columns
-- (real column is account_status, default 'active') - both were dropped from
-- the insert lists in 01_fix_ensure_public_user.sql because they don't exist.
--
-- Supabase sets auth.users.raw_app_meta_data->>'provider' automatically at
-- signup time for every auth method this app uses:
--   'apple'  -> iOS native Apple Sign In (mobile)
--   'google' -> Google Sign In (Android only, mobile)
--   'email'  -> email/password signup (web or mobile)
-- Anything else (NULL, or a provider this app doesn't use) is left NULL here
-- rather than guessed at.
-- ============================================================================

BEGIN;

-- Idempotent-safe: no-op if the column already exists (it does, per live
-- query results), but this migration must stand on its own.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_platform text;

-- Postgres refuses CREATE OR REPLACE when OUT-parameter names change
-- ("cannot change return type of existing function") - drop first, same as
-- 04_fix_ambiguous_column.sql did. This function's actual OUT param is
-- already `result_user_id` in production; we're not renaming it again here,
-- just adding an internal variable and an extra INSERT column, but keeping
-- the DROP is the safe, already-proven pattern for this specific function.
DROP FUNCTION IF EXISTS public.ensure_public_user_for_user(uuid);

CREATE FUNCTION public.ensure_public_user_for_user(p_user_id uuid)
RETURNS TABLE (
    result_user_id uuid,
    inserted boolean,
    error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public,auth,pg_catalog
AS $$
DECLARE
  target auth.users%ROWTYPE;
  sanitized_name text;
  username_base text;
  candidate text;
  final_username text;
  metadata jsonb := '{}';
  derived_platform text;
  has_email_column boolean;
  candidate_suffix int := 0;
  max_attempts int := 30;
  rows_inserted int := 0;
  err_text text := NULL;
BEGIN
  IF p_user_id IS NULL THEN
    err_text := 'ensure_public_user_for_user requires a user_id';
    RAISE WARNING '%', err_text;
    RETURN QUERY SELECT NULL::uuid, false, err_text;
    RETURN;
  END IF;

  SELECT * INTO target FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    err_text := format('auth.users row %s not found', p_user_id);
    RAISE WARNING '%', err_text;
    RETURN QUERY SELECT p_user_id, false, err_text;
    RETURN;
  END IF;

  metadata := COALESCE(target.raw_user_meta_data, '{}'::jsonb);

  sanitized_name := NULLIF(trim(metadata->>'full_name'), '');
  sanitized_name := COALESCE(sanitized_name, NULLIF(trim(metadata->>'name'), ''));
  sanitized_name := COALESCE(sanitized_name, NULLIF(trim(metadata->>'display_name'), ''));
  sanitized_name := COALESCE(sanitized_name, NULLIF(trim(metadata->>'preferred_name'), ''));
  IF sanitized_name IS NULL AND target.email IS NOT NULL THEN
    sanitized_name := split_part(target.email, '@', 1);
  END IF;
  IF sanitized_name IS NULL OR sanitized_name = '' THEN
    sanitized_name := 'Synth User';
  END IF;

  username_base := NULLIF(regexp_replace(lower(metadata->>'preferred_username'), '[^a-z0-9_.]', '', 'g'), '');
  username_base := COALESCE(username_base, NULLIF(regexp_replace(lower(metadata->>'username'), '[^a-z0-9_.]', '', 'g'), ''));
  username_base := COALESCE(username_base, NULLIF(regexp_replace(lower(metadata->>'display_name'), '[^a-z0-9_.]', '', 'g'), ''));
  username_base := COALESCE(username_base, NULLIF(regexp_replace(lower(sanitized_name), '[^a-z0-9]', '', 'g'), ''));
  IF username_base IS NULL OR username_base = '' THEN
    username_base := 'user_' || substring(p_user_id::text, 1, 8);
  END IF;
  username_base := regexp_replace(username_base, '^[._]+|[._]+$', '', 'g');
  IF char_length(username_base) > 30 THEN
    username_base := substring(username_base FROM 1 FOR 30);
  END IF;
  IF username_base IS NULL OR username_base = '' THEN
    username_base := 'user';
  END IF;

  derived_platform := CASE target.raw_app_meta_data ->> 'provider'
    WHEN 'apple' THEN 'ios'
    WHEN 'google' THEN 'android'
    WHEN 'email' THEN 'email'
    ELSE NULL
  END;

  has_email_column := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
  );

  LOOP
    candidate := username_base;
    IF candidate_suffix > 0 THEN
      candidate := left(username_base, GREATEST(1, 30 - char_length('_' || candidate_suffix::text)))
        || '_' || candidate_suffix::text;
    END IF;

    candidate := regexp_replace(candidate, '[^a-z0-9_.]', '', 'g');
    candidate := regexp_replace(candidate, '^[._]+|[._]+$', '', 'g');
    IF char_length(candidate) < 3 THEN
      candidate := candidate || substring(p_user_id::text, 1, 4);
    END IF;
    IF char_length(candidate) > 30 THEN
      candidate := substring(candidate FROM 1 FOR 30);
    END IF;

    final_username := candidate;

    BEGIN
      IF has_email_column THEN
        INSERT INTO public.users (
          user_id,
          name,
          username,
          email,
          account_type,
          is_public_profile,
          similar_users_notifications,
          last_active_at,
          permissions_metadata,
          signup_platform,
          created_at,
          updated_at
        )
        VALUES (
          p_user_id,
          sanitized_name,
          final_username,
          target.email,
          'user',
          true,
          true,
          COALESCE(target.created_at, now()),
          '{}'::jsonb,
          derived_platform,
          COALESCE(target.created_at, now()),
          COALESCE(target.updated_at, now())
        )
        ON CONFLICT (user_id) DO NOTHING;
      ELSE
        INSERT INTO public.users (
          user_id,
          name,
          username,
          account_type,
          is_public_profile,
          similar_users_notifications,
          last_active_at,
          permissions_metadata,
          signup_platform,
          created_at,
          updated_at
        )
        VALUES (
          p_user_id,
          sanitized_name,
          final_username,
          'user',
          true,
          true,
          COALESCE(target.created_at, now()),
          '{}'::jsonb,
          derived_platform,
          COALESCE(target.created_at, now()),
          COALESCE(target.updated_at, now())
        )
        ON CONFLICT (user_id) DO NOTHING;
      END IF;

      GET DIAGNOSTICS rows_inserted := ROW_COUNT;
      IF rows_inserted > 0 THEN
        RAISE LOG 'Created public.users row for % (username=%, signup_platform=%)', p_user_id, final_username, derived_platform;
      ELSE
        RAISE LOG 'public.users row already existed for %', p_user_id;
      END IF;

      RETURN QUERY SELECT p_user_id, rows_inserted > 0, NULL::text;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      candidate_suffix := candidate_suffix + 1;
      IF candidate_suffix > max_attempts THEN
        err_text := format('could not generate unique username for % within % attempts', p_user_id, max_attempts);
        RAISE WARNING '%', err_text;
        RETURN QUERY SELECT p_user_id, false, err_text;
        RETURN;
      END IF;
      CONTINUE;
    WHEN OTHERS THEN
      err_text := SQLERRM;
      RAISE WARNING 'Could not insert public.users row for %: %', p_user_id, err_text;
      RETURN QUERY SELECT p_user_id, false, err_text;
      RETURN;
    END;
  END LOOP;
END;
$$;

-- Fallback path (used only if ensure_public_user_for_user itself throws)
-- also needs to set signup_platform, or a signup that hits this rare branch
-- would reintroduce the same NULL gap this migration fixes. Column list
-- matches the live version from onboarding-signup-fix-2026-07-27/01 exactly
-- (no moderation_status, no account_type - those aren't in this minimal
-- fallback insert either).
CREATE OR REPLACE FUNCTION public.trigger_ensure_public_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public,auth,pg_catalog
AS $$
DECLARE
  fallback_name text;
  fallback_username text;
  fallback_platform text;
  has_email_column boolean;
BEGIN
  fallback_name := COALESCE(NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'Synth User');
  fallback_username := 'user_' || substring(NEW.id::text, 1, 8);
  fallback_platform := CASE NEW.raw_app_meta_data ->> 'provider'
    WHEN 'apple' THEN 'ios'
    WHEN 'google' THEN 'android'
    WHEN 'email' THEN 'email'
    ELSE NULL
  END;
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

    BEGIN
      IF has_email_column THEN
        INSERT INTO public.users (
          user_id,
          name,
          username,
          bio,
          is_public_profile,
          email,
          signup_platform,
          created_at,
          updated_at
        )
        VALUES (
          NEW.id,
          fallback_name,
          fallback_username,
          'Music lover looking to connect at events!',
          true,
          NEW.email,
          fallback_platform,
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
          is_public_profile,
          signup_platform,
          created_at,
          updated_at
        )
        VALUES (
          NEW.id,
          fallback_name,
          fallback_username,
          'Music lover looking to connect at events!',
          true,
          fallback_platform,
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

-- Backfill existing rows from the real historical auth provider. Covers
-- every NULL signup_platform row, not just the two flagged in the admin
-- check (namrahk2005@gmail.com, john.f.drake01@gmail.com) - anyone else who
-- signed up before this trigger fix existed gets corrected the same way.
UPDATE public.users u
SET signup_platform = derived.platform
FROM (
  SELECT
    au.id AS user_id,
    CASE au.raw_app_meta_data ->> 'provider'
      WHEN 'apple' THEN 'ios'
      WHEN 'google' THEN 'android'
      WHEN 'email' THEN 'email'
      ELSE NULL
    END AS platform
  FROM auth.users au
) derived
WHERE u.user_id = derived.user_id
  AND derived.platform IS NOT NULL
  AND (u.signup_platform IS NULL OR u.signup_platform = 'unknown');

COMMIT;
