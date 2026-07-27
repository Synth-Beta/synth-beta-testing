-- ============================================================================
-- CRITICAL FOLLOW-UP FIX #2: "column reference \"user_id\" is ambiguous"
-- ============================================================================
--
-- Discovered immediately after applying 03_fix_infinite_loop.sql: calling the
-- function for test@synth.com returned inserted=false, error=
-- 'column reference "user_id" is ambiguous'.
--
-- Root cause: `RETURNS TABLE (user_id uuid, inserted boolean, error text)`
-- implicitly declares `user_id` as a PL/pgSQL variable in scope for the whole
-- function body (this is how OUT parameters work). `public.users` also has a
-- column named `user_id`. Inside `INSERT INTO public.users (...) ON CONFLICT
-- (user_id) DO NOTHING`, Postgres can't tell whether `user_id` refers to the
-- table column or the output variable — a known PL/pgSQL gotcha when a
-- RETURNS TABLE column name collides with a table column name used inside
-- the function body.
--
-- Same story as bugs 1-3: this always existed, but execution never reached
-- the INSERT statement until the last two fixes landed.
--
-- Fix: rename the function's output column from `user_id` to
-- `result_user_id`, eliminating the name collision. This does NOT change
-- ensure_public_user()'s client-facing output — that wrapper does
-- `RETURN QUERY SELECT * FROM ensure_public_user_for_user(...)`, which binds
-- columns positionally (by order + type), not by name, so its own
-- `user_id uuid` output column is untouched. Only a caller that invokes
-- ensure_public_user_for_user() directly and reads the column BY NAME (e.g.
-- 02_backfill_orphaned_users.sql's `SELECT *`) would see the column now
-- labeled `result_user_id` instead of `user_id` — cosmetic only.

BEGIN;

-- Postgres refuses CREATE OR REPLACE when OUT-parameter names change
-- ("cannot change return type of existing function") — drop first.
-- ensure_public_user() calls this by name inside its plpgsql body, which is
-- not a tracked pg_depend edge (function bodies are opaque text), so this
-- DROP does not cascade-fail or break that wrapper.
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

COMMIT;
