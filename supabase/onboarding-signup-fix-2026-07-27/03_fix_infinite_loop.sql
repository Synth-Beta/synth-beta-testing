-- ============================================================================
-- CRITICAL FOLLOW-UP FIX: ensure_public_user_for_user() hangs forever.
-- ============================================================================
--
-- Discovered while testing 01_fix_ensure_public_user.sql: calling the function
-- for a real user (lauren@gmail.com) hung for 70+ seconds with no lock wait
-- (confirmed via pg_stat_activity: state=active, wait_event=null — genuinely
-- spinning, not blocked). Had to pg_terminate_backend() it manually.
--
-- Root cause (present since the original 2026-07-16 migration, never
-- triggered until now): inside the `LOOP ... END LOOP`, every exit path does
-- `RETURN QUERY SELECT ...` but never follows it with a bare `RETURN;`.
-- `RETURN QUERY` in a set-returning PL/pgSQL function only QUEUES a row for
-- output — it does not stop execution. Control falls through to the bottom
-- of the loop body and loops again:
--   - On a successful insert: loops again, tries to insert the exact same
--     row again, hits `ON CONFLICT (user_id) DO NOTHING`, queues another row,
--     loops again — forever.
--   - When unique-username retries are exhausted (candidate_suffix >
--     max_attempts): the `RETURN QUERY` inside that branch is followed by an
--     unconditional `CONTINUE` sitting outside the `IF`, so it loops again
--     immediately, re-hits the same "exhausted" branch, queues another row,
--     forever.
--   - In the generic `WHEN OTHERS` handler: same missing exit, loops forever.
--
-- This was invisible before because Bug 1 (`target.user_metadata`, fixed in
-- 01_fix_ensure_public_user.sql) crashed the function on every call, always
-- BEFORE reaching this loop. Fixing Bug 1 without this fix would have made
-- every signup and every onboarding "Continue" tap hang indefinitely instead
-- of erroring — worse than the original bug, since it ties up a DB
-- connection per hung caller instead of failing fast.
--
-- Fix: add an explicit bare `RETURN;` after every `RETURN QUERY` inside the
-- loop so the function actually exits once it has an answer.

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

      -- FIX (Bug 3): this used to fall through and loop again forever.
      RETURN QUERY SELECT p_user_id, rows_inserted > 0, NULL::text;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      candidate_suffix := candidate_suffix + 1;
      IF candidate_suffix > max_attempts THEN
        err_text := format('could not generate unique username for % within % attempts', p_user_id, max_attempts);
        RAISE WARNING '%', err_text;
        -- FIX (Bug 3): this used to fall through to the CONTINUE below
        -- unconditionally, looping forever instead of stopping here.
        RETURN QUERY SELECT p_user_id, false, err_text;
        RETURN;
      END IF;
      CONTINUE;
    WHEN OTHERS THEN
      err_text := SQLERRM;
      RAISE WARNING 'Could not insert public.users row for %: %', p_user_id, err_text;
      -- FIX (Bug 3): this used to fall through and loop again forever.
      RETURN QUERY SELECT p_user_id, false, err_text;
      RETURN;
    END;
  END LOOP;
END;
$$;

COMMIT;
