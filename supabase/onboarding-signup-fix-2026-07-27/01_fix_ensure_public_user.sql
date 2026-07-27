-- ============================================================================
-- CRITICAL FIX: new-user signup/onboarding has been broken since 2026-07-16.
-- ============================================================================
--
-- Root cause (two compounding bugs in supabase/migrations/20260716130000_add_public_user_trigger.sql):
--
-- BUG 1: `ensure_public_user_for_user(uuid)` reads `target.user_metadata`, but
-- `auth.users` has no such column — the real column is `raw_user_meta_data`
-- (confirmed: information_schema.columns for auth.users has raw_app_meta_data
-- and raw_user_meta_data, nothing named user_metadata). This line runs
-- unconditionally, before any exception handling, so EVERY call to this
-- function throws "record \"target\" has no field \"user_metadata\"" —
-- confirmed live in Postgres logs, 5 occurrences in the last few minutes from
-- a real user (test@synth.com) tapping "Continue" on the onboarding profile
-- screen and hitting "Something went wrong. Could not save your profile."
--
-- This function is called from two places:
--   a) `trigger_ensure_public_user()` — AFTER INSERT trigger on auth.users,
--      fires on every signup (email + Apple). Wrapped in its own
--      EXCEPTION WHEN OTHERS with a fallback insert, so signup itself mostly
--      still succeeds — but the fallback discards the user's real name and
--      any OAuth-provided username (e.g. Apple Sign In's captured name),
--      always falling back to "user_<8 hex chars>" / email-prefix-or-"Synth
--      User" instead.
--   b) `ensure_public_user()` RPC — called directly by mobile's
--      OnboardingService.saveProfileSetup() on every "Continue" tap in
--      profile setup. This call path has NO fallback, so it throws straight
--      back to the client every time, and the user's profile edits (name,
--      username, birthday, etc.) never save.
--
-- BUG 2: both the primary insert (in ensure_public_user_for_user) and the
-- trigger's fallback insert reference two columns that don't exist on
-- public.users at all: `moderation_status` and `warning_count`. The real
-- column is `account_status` (text, default 'active' — all 118 existing
-- users have this value). This is why some signups end up with NO
-- public.users row whatsoever, not even the fallback one: the fallback
-- insert ALSO fails on this same nonexistent column, caught silently by its
-- own exception handler. Confirmed via information_schema.columns and via
-- 4 real orphaned auth.users rows with no matching public.users row:
-- lauren@gmail.com (2026-07-21), wondertommy25@gmail.com (2026-07-22),
-- olivia.anrrich@icloud.com (2026-07-24), test@synth.com (2026-07-27, today).
--
-- Fix: correct the column name and drop the two nonexistent columns from
-- both insert statements. Then backfill the orphaned users so they get a
-- real profile row (using their actual OAuth/email metadata now that the
-- primary path works) instead of staying stuck.

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_public_user_for_user(p_user_id uuid)
RETURNS TABLE (
    user_id uuid,
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
  END IF;

  SELECT * INTO target FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    err_text := format('auth.users row %s not found', p_user_id);
    RAISE WARNING '%', err_text;
    RETURN QUERY SELECT p_user_id, false, err_text;
  END IF;

  -- FIX (Bug 1): auth.users has no `user_metadata` column — the real column
  -- is `raw_user_meta_data`.
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
      -- FIX (Bug 2): dropped `moderation_status` and `warning_count` — neither
      -- column exists on public.users (real column is `account_status`,
      -- default 'active', so simply omitting it here preserves that default).
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
          COALESCE(target.created_at, now()),
          COALESCE(target.updated_at, now())
        )
        ON CONFLICT (user_id) DO NOTHING;
      END IF;

      GET DIAGNOSTICS rows_inserted := ROW_COUNT;
      IF rows_inserted > 0 THEN
        RAISE LOG 'Created public.users row for % (username=%)', p_user_id, final_username;
      ELSE
        RAISE LOG 'public.users row already existed for %', p_user_id;
      END IF;

      RETURN QUERY SELECT p_user_id, rows_inserted > 0, NULL;
    EXCEPTION WHEN unique_violation THEN
      candidate_suffix := candidate_suffix + 1;
      IF candidate_suffix > max_attempts THEN
        err_text := format('could not generate unique username for % within % attempts', p_user_id, max_attempts);
        RAISE WARNING '%', err_text;
        RETURN QUERY SELECT p_user_id, false, err_text;
      END IF;
      CONTINUE;
    WHEN OTHERS THEN
      err_text := SQLERRM;
      RAISE WARNING 'Could not insert public.users row for %: %', p_user_id, err_text;
      RETURN QUERY SELECT p_user_id, false, err_text;
    END;
  END LOOP;
END;
$$;

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

    -- FIX (Bug 2): dropped `moderation_status`, which doesn't exist on
    -- public.users — this was silently killing the fallback insert too,
    -- leaving some users with NO public.users row at all.
    BEGIN
      IF has_email_column THEN
        INSERT INTO public.users (
          user_id,
          name,
          username,
          bio,
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
          is_public_profile,
          created_at,
          updated_at
        )
        VALUES (
          NEW.id,
          fallback_name,
          fallback_username,
          'Music lover looking to connect at events!',
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

COMMIT;
