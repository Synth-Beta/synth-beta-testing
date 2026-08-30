-- =============================================================================
-- 02 — Verify the notification fixes from 01
-- =============================================================================
-- Walks a real user through the full ladder and asserts what the friend gets
-- notified about at each step:
--
--   none -> interested -> going -> interested -> none -> interested
--
-- Expected: exactly ONE 'event_interest' notification across that whole
-- sequence. Before 01 it was three (initial insert, the going upgrade, and the
-- re-heart after delete), with the going one using the wrong verb.
--
-- SAFE TO RUN AGAINST PROD. The DO block ends with a deliberate
-- RAISE EXCEPTION, which rolls back every write it made — including the
-- notification rows the trigger produced. The assertion results come back as
-- the exception message. Nothing is left behind.
--
-- If it prints "ALL ASSERTIONS PASSED", the fixes work.
-- If any assertion fails you get "FAILED: <which>" instead, also rolled back.
--
-- -----------------------------------------------------------------------------
-- WHY THERE IS NOT A SINGLE `INTO` IN THIS FILE
-- -----------------------------------------------------------------------------
-- The Supabase dashboard SQL editor lints the statement before running it and
-- does not understand that a DO block's body is plpgsql. In plain SQL,
-- `SELECT count(*) INTO v_baseline FROM ...` means "create a table named
-- v_baseline", so the editor decided this script created tables and appended:
--
--     -- Added by Supabase: enable Row Level Security on newly created tables
--     ALTER TABLE v_user ENABLE ROW LEVEL SECURITY;
--
-- ...INSIDE the $$ ... $$ body, which breaks the dollar quoting and fails with
-- `42601: unterminated dollar-quoted string`. CREATE FUNCTION bodies are not
-- scanned this way, which is why 01 applied cleanly with INTO in it.
--
-- So: every value here is set with `:=` and a scalar subquery, and the one
-- two-column fetch uses a FOR loop. Do not "simplify" these back to SELECT INTO.
-- =============================================================================

DO $verify$
DECLARE
  v_user     uuid;
  v_friend   uuid;
  v_event    uuid;
  v_baseline int;
  v_after    int;
  v_type     text;
  v_rows     int;
  v_report   text := '';
  v_pair     record;
BEGIN
  -- Pick an existing accepted friend pair. No fixtures created.
  FOR v_pair IN
    SELECT ur.user_id AS a, ur.related_user_id AS b
    FROM public.user_relationships ur
    WHERE ur.relationship_type = 'friend'
      AND ur.status = 'accepted'
      AND ur.user_id <> ur.related_user_id
    LIMIT 1
  LOOP
    v_user   := v_pair.a;
    v_friend := v_pair.b;
  END LOOP;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'SKIPPED: no accepted friend pair exists to test with';
  END IF;

  -- Pick a future event this user has no relationship to yet.
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
    RAISE EXCEPTION 'SKIPPED: no unrelated future event found for user %', v_user;
  END IF;

  v_baseline := (
    SELECT count(*)
    FROM public.notifications n
    WHERE n.user_id = v_friend AND n.type = 'event_interest'
      AND n.data->>'event_id' = v_event::text
  );

  -- ---- step 1: none -> interested. Should notify exactly once. -------------
  INSERT INTO public.user_event_relationships (user_id, event_id, relationship_type)
  VALUES (v_user, v_event, 'interested');

  v_after := (
    SELECT count(*)
    FROM public.notifications n
    WHERE n.user_id = v_friend AND n.type = 'event_interest'
      AND n.data->>'event_id' = v_event::text
  );

  IF v_after <> v_baseline + 1 THEN
    RAISE EXCEPTION 'FAILED step 1 (new interest should notify once): baseline=% after=%',
      v_baseline, v_after;
  END IF;
  v_report := v_report || E'\n  step 1 none->interested: notified once  OK';

  -- ---- step 2: interested -> going. Should be silent. ----------------------
  UPDATE public.user_event_relationships
  SET relationship_type = 'going'
  WHERE user_id = v_user AND event_id = v_event;

  v_after := (
    SELECT count(*)
    FROM public.notifications n
    WHERE n.user_id = v_friend AND n.type = 'event_interest'
      AND n.data->>'event_id' = v_event::text
  );

  IF v_after <> v_baseline + 1 THEN
    RAISE EXCEPTION 'FAILED step 2 (going upgrade must be silent): expected % got %',
      v_baseline + 1, v_after;
  END IF;

  v_type := (
    SELECT r.relationship_type
    FROM public.user_event_relationships r
    WHERE r.user_id = v_user AND r.event_id = v_event
  );
  v_rows := (
    SELECT count(*)
    FROM public.user_event_relationships r
    WHERE r.user_id = v_user AND r.event_id = v_event
  );

  IF v_type <> 'going' OR v_rows <> 1 THEN
    RAISE EXCEPTION 'FAILED step 2 (ladder state): type=% rows=%', v_type, v_rows;
  END IF;
  v_report := v_report || E'\n  step 2 interested->going: silent, 1 row type=going  OK';

  -- ---- step 3: going -> interested. Should be silent. ----------------------
  UPDATE public.user_event_relationships
  SET relationship_type = 'interested'
  WHERE user_id = v_user AND event_id = v_event;

  v_after := (
    SELECT count(*)
    FROM public.notifications n
    WHERE n.user_id = v_friend AND n.type = 'event_interest'
      AND n.data->>'event_id' = v_event::text
  );

  IF v_after <> v_baseline + 1 THEN
    RAISE EXCEPTION 'FAILED step 3 (un-going must be silent): expected % got %',
      v_baseline + 1, v_after;
  END IF;
  v_report := v_report || E'\n  step 3 going->interested: silent  OK';

  -- ---- step 4: delete, then re-insert. Dedup must suppress (bug 6). --------
  DELETE FROM public.user_event_relationships
  WHERE user_id = v_user AND event_id = v_event;

  v_rows := (
    SELECT count(*)
    FROM public.user_event_relationships r
    WHERE r.user_id = v_user AND r.event_id = v_event
  );

  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAILED step 4 (delete left % rows)', v_rows;
  END IF;

  INSERT INTO public.user_event_relationships (user_id, event_id, relationship_type)
  VALUES (v_user, v_event, 'interested');

  v_after := (
    SELECT count(*)
    FROM public.notifications n
    WHERE n.user_id = v_friend AND n.type = 'event_interest'
      AND n.data->>'event_id' = v_event::text
  );

  IF v_after <> v_baseline + 1 THEN
    RAISE EXCEPTION 'FAILED step 4 (re-heart must not re-notify): expected % got %',
      v_baseline + 1, v_after;
  END IF;
  v_report := v_report || E'\n  step 4 delete + re-heart: no second notification  OK';

  -- Always fails on purpose so the whole thing rolls back.
  -- RAISE substitutes bare `%` only — there is no `%s`, and `%%` is an escaped
  -- literal percent. Placeholder count must equal argument count exactly, or
  -- Postgres refuses at compile time with 42601 "too many parameters for RAISE".
  RAISE EXCEPTION E'ALL ASSERTIONS PASSED (rolled back, nothing written)\nuser=% friend=% event=%\n%',
    v_user, v_friend, v_event, v_report;
END
$verify$;
