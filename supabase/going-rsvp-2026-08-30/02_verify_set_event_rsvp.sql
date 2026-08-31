-- =============================================================================
-- 02 — Verify set_event_rsvp
-- =============================================================================
-- JUST PASTE AND RUN THIS IN THE SUPABASE SQL EDITOR. No special login needed.
--
-- Walks the ladder through the RPC and asserts every transition:
--
--   none -> interested -> going -> (unforced heart, must NOT demote)
--        -> interested (forced) -> none, plus an invalid-target check
--
-- SAFE ON PROD: ends in a deliberate RAISE EXCEPTION, so everything rolls back.
-- Success looks like an error whose message starts "ALL ASSERTIONS PASSED".
--
-- -----------------------------------------------------------------------------
-- HOW IT RUNS AS A USER
-- -----------------------------------------------------------------------------
-- The dashboard SQL editor always runs as the service role, where auth.uid() is
-- NULL — there is no way to "sign in as a user" in it. So this block picks a real
-- user and impersonates them for the rest of the transaction:
--
--   * set_config('request.jwt.claims', ...) is what auth.uid() actually reads.
--   * set_config('role', 'authenticated', ...) drops superuser, so the RLS
--     policies on user_event_relationships are genuinely enforced — this exercises
--     the same path the app takes, not a privileged shortcut.
--
-- Both use is_local => true, so they revert when the transaction ends. Combined
-- with the closing RAISE EXCEPTION, nothing survives this script.
--
-- -----------------------------------------------------------------------------
-- TWO EDITOR GOTCHAS THIS FILE DELIBERATELY AVOIDS
-- -----------------------------------------------------------------------------
-- 1. NO `INTO` ANYWHERE. The Supabase dashboard lints a DO block as plain SQL,
--    reads `SELECT ... INTO v_x` as "create table v_x", and appends
--    `ALTER TABLE v_x ENABLE ROW LEVEL SECURITY` INSIDE the $$ body — breaking
--    the dollar quoting with `42601: unterminated dollar-quoted string`.
--    Use `:=` with scalar subqueries. CREATE FUNCTION bodies are NOT scanned
--    this way, which is why 01 may use RETURNING ... INTO safely.
-- 2. RAISE substitutes bare `%` ONLY. There is no `%s`, and `%%` is an escaped
--    literal percent. Placeholder count must equal argument count exactly or
--    Postgres refuses at compile time with 42601 "too many parameters for RAISE".
-- =============================================================================

DO $verify$
DECLARE
  v_user   uuid;
  v_event  uuid;
  v_got    text;
  v_rows   int;
  v_type   text;
  v_report text := '';
BEGIN
  -- Pick any real user, then find an upcoming event they have no relationship to.
  -- Both reads happen before the role switch, while we still have full visibility.
  v_user := (SELECT u.user_id FROM public.users u LIMIT 1);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'SKIPPED: no users exist to test with';
  END IF;

  v_event := (
    SELECT e.id
    FROM public.events e
    WHERE e.event_date > now()
      AND NOT EXISTS (
        SELECT 1 FROM public.user_event_relationships r
        WHERE r.user_id = v_user AND r.event_id = e.id
      )
    LIMIT 1
  );

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'SKIPPED: no unrelated future event available for user %', v_user;
  END IF;

  -- Become that user for the rest of the transaction.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('role', 'authenticated', true);

  IF auth.uid() IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'SETUP FAILED: auth.uid() is % but should be %', auth.uid(), v_user;
  END IF;
  v_report := v_report || E'\n  impersonation active, RLS enforced as authenticated  OK';

  -- ---- none -> interested --------------------------------------------------
  v_got := public.set_event_rsvp(v_event, 'interested');
  IF v_got <> 'interested' THEN
    RAISE EXCEPTION 'FAILED none->interested: returned %', v_got;
  END IF;
  v_report := v_report || E'\n  none->interested  OK';

  -- ---- interested -> going, upgraded in place, still one row ---------------
  v_got := public.set_event_rsvp(v_event, 'going');
  v_type := (
    SELECT r.relationship_type FROM public.user_event_relationships r
    WHERE r.user_id = v_user AND r.event_id = v_event
  );
  v_rows := (
    SELECT count(*) FROM public.user_event_relationships r
    WHERE r.user_id = v_user AND r.event_id = v_event
  );
  IF v_got <> 'going' OR v_type <> 'going' OR v_rows <> 1 THEN
    RAISE EXCEPTION 'FAILED interested->going: returned=% type=% rows=%', v_got, v_type, v_rows;
  END IF;
  v_report := v_report || E'\n  interested->going (1 row, upgraded not duplicated)  OK';

  -- ---- going -> going, idempotent -----------------------------------------
  v_got := public.set_event_rsvp(v_event, 'going');
  IF v_got <> 'going' THEN
    RAISE EXCEPTION 'FAILED idempotent going: returned %', v_got;
  END IF;
  v_report := v_report || E'\n  going->going idempotent  OK';

  -- ---- THE p_force CONTRACT ------------------------------------------------
  -- An unforced 'interested' write is what the heart sends. It must leave a
  -- going row alone. If this assertion ever fails, hearting an event you are
  -- going to silently downgrades your RSVP.
  v_got := public.set_event_rsvp(v_event, 'interested');
  IF v_got <> 'going' THEN
    RAISE EXCEPTION 'FAILED unforced interested must not demote going: returned %', v_got;
  END IF;
  v_report := v_report || E'\n  going + unforced heart stays going (no demotion)  OK';

  -- Forced is what the Going button sends when stepping back down.
  v_got := public.set_event_rsvp(v_event, 'interested', true);
  IF v_got <> 'interested' THEN
    RAISE EXCEPTION 'FAILED forced going->interested: returned %', v_got;
  END IF;
  v_report := v_report || E'\n  going->interested with p_force (un-going falls back)  OK';

  -- ---- interested -> none --------------------------------------------------
  v_got := public.set_event_rsvp(v_event, NULL);
  v_rows := (
    SELECT count(*) FROM public.user_event_relationships r
    WHERE r.user_id = v_user AND r.event_id = v_event
  );
  IF v_got IS NOT NULL OR v_rows <> 0 THEN
    RAISE EXCEPTION 'FAILED interested->none: returned=% rows=%', v_got, v_rows;
  END IF;
  v_report := v_report || E'\n  interested->none (row deleted)  OK';

  -- ---- invalid target is rejected -----------------------------------------
  BEGIN
    v_got := public.set_event_rsvp(v_event, 'maybe');
    RAISE EXCEPTION 'FAILED: invalid target ''maybe'' was accepted';
  EXCEPTION WHEN sqlstate '22023' THEN
    v_report := v_report || E'\n  invalid target rejected with 22023  OK';
  END;

  RAISE EXCEPTION E'ALL ASSERTIONS PASSED (rolled back, nothing written)\nuser=%\nevent=%\n%',
    v_user, v_event, v_report;
END
$verify$;
