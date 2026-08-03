-- =============================================================================
-- 01 — register_device_token(): retire this user's other active tokens on the
--       same platform when a new token registers
-- =============================================================================
-- WHY: register_device_token() has always upserted ON CONFLICT (user_id, device_token)
-- only — a *new* token string (issued on every reinstall, EAS rebuild, or app-version
-- bump) never collides with an old row, so the old row is never retired. Users
-- accumulate multiple simultaneously `is_active = true` tokens for the same platform,
-- and api/push-notification-webhook.ts sends one push per active row for a user, so
-- the same physical device gets one duplicate banner per stale-but-still-valid token.
--
-- Confirmed live 2026-08-02: user 349bda34-7878-4c10-9f86-ec5888e55571 had 3
-- simultaneously active tokens (1 stale raw-APNs from a pre-Expo Capacitor build +
-- Expo tokens from app v1.4.1 and v1.4.7) and got 2 duplicate "New event at Union
-- Stage!" push banners for a single `notifications` row. 5 users total currently
-- carry 2-3 active tokens each (see 02's audit query for the live list).
--
-- The `device_id` column exists but the mobile client has never populated it
-- (mobile/lib/pushTokenSync.ts hardcodes p_device_id: null; confirmed live: 0 of 56
-- device_tokens rows have it set) — so there's no reliable "same physical device" key
-- to dedupe on yet. Pragmatic fix: on every successful registration, deactivate this
-- user's OTHER currently-active tokens for the SAME platform, keeping only the one
-- that just registered. A user with two real simultaneous iOS devices will now only
-- get push on whichever registered most recently — narrower than before, but it
-- matches the dedupe backstop added to the webhook in this same fix, and it kills the
-- duplicate-push bug this was written for. If per-device (not per-platform) tracking
-- is wanted later, wire p_device_id from the client (e.g. expo-application's
-- androidId / iOS identifierForVendor) and redo this keyed on device_id instead.
--
-- SAFETY: same function signature, all existing callers (mobile/lib/pushTokenSync.ts,
-- web PushTokenService) unchanged. Only touches the calling user's own device_tokens
-- rows (auth.uid()-scoped, SECURITY DEFINER unchanged from original). Idempotent —
-- re-registering the same token twice is a no-op for the retire step (id = v_token_id
-- excludes itself). Deactivation is non-destructive: no rows deleted, and a device
-- always gets reactivated the next time it registers.
-- Review, then apply yourself.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_device_token text,
  p_platform text,
  p_device_id text DEFAULT NULL::text,
  p_app_version text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_token_id UUID;
BEGIN
  -- Get current user (must be authenticated)
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Validate platform
  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Platform must be ios or android';
  END IF;

  -- Insert or update device token (ON CONFLICT handles exact-token duplicates safely)
  INSERT INTO public.device_tokens (
    user_id,
    device_token,
    platform,
    device_id,
    app_version,
    is_active,
    updated_at
  ) VALUES (
    v_user_id,
    p_device_token,
    p_platform,
    p_device_id,
    p_app_version,
    true,
    now()
  )
  ON CONFLICT (user_id, device_token)
  DO UPDATE SET
    is_active = true,
    device_id = COALESCE(EXCLUDED.device_id, device_tokens.device_id),
    app_version = COALESCE(EXCLUDED.app_version, device_tokens.app_version),
    updated_at = now()
  RETURNING id INTO v_token_id;

  -- NEW: retire this user's other active tokens on the same platform — the row we
  -- just inserted/updated is now the single source of truth for pushes on this
  -- platform, so any previously-accumulated stale tokens stop receiving duplicates.
  UPDATE public.device_tokens
  SET is_active = false, updated_at = now()
  WHERE user_id = v_user_id
    AND platform = p_platform
    AND id <> v_token_id
    AND is_active = true;

  RETURN v_token_id;
END;
$function$;

-- ---- VERIFY -----------------------------------------------------------------
-- Retire logic is present in the deployed function body:
SELECT prosrc ILIKE '%is_active = false%' AS retire_logic_present
FROM pg_proc WHERE proname = 'register_device_token';
-- Expect: true

-- No user+platform pair can have more than one active token going forward. Re-run
-- this after any real registration (or the simulated one below) — expect 0 rows:
SELECT user_id, platform, count(*) AS active_tokens
FROM public.device_tokens
WHERE is_active = true
GROUP BY user_id, platform
HAVING count(*) > 1;

-- Optional live simulation against the affected user from the incident (safe — it
-- only touches that user's own rows, and their real app will re-register normally
-- the next time it opens, overwriting this test token):
--   SELECT public.register_device_token('test-retire-check', 'ios', NULL, 'test');
--   SELECT id, device_token, is_active, updated_at FROM public.device_tokens
--   WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571' AND platform = 'ios'
--   ORDER BY updated_at DESC;
--   -- Expect: only the 'test-retire-check' row is_active = true, all others false.

-- ---- ROLLBACK -----------------------------------------------------------------
-- Restore the original function body (upsert only, no retire step):
--
-- CREATE OR REPLACE FUNCTION public.register_device_token(p_device_token text, p_platform text, p_device_id text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text)
-- RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
-- DECLARE
--   v_user_id UUID;
--   v_token_id UUID;
-- BEGIN
--   v_user_id := auth.uid();
--   IF v_user_id IS NULL THEN
--     RAISE EXCEPTION 'User must be authenticated';
--   END IF;
--   IF p_platform NOT IN ('ios', 'android') THEN
--     RAISE EXCEPTION 'Platform must be ios or android';
--   END IF;
--   INSERT INTO public.device_tokens (user_id, device_token, platform, device_id, app_version, is_active, updated_at)
--   VALUES (v_user_id, p_device_token, p_platform, p_device_id, p_app_version, true, now())
--   ON CONFLICT (user_id, device_token)
--   DO UPDATE SET is_active = true,
--     device_id = COALESCE(EXCLUDED.device_id, device_tokens.device_id),
--     app_version = COALESCE(EXCLUDED.app_version, device_tokens.app_version),
--     updated_at = now()
--   RETURNING id INTO v_token_id;
--   RETURN v_token_id;
-- END;
-- $function$;
