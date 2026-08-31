-- =============================================================================
-- 01 — set_event_rsvp: single source of truth for the interested/going ladder
-- =============================================================================
-- Design doc: docs/superpowers/specs/2026-08-30-going-rsvp-design.md
-- Plan:       docs/superpowers/plans/2026-08-30-going-rsvp.md  (Task 1)
--
-- REVIEW THIS, THEN APPLY IT YOURSELF. Nothing here is auto-applied.
--
-- Replaces two divergent client implementations (web UserEventService.
-- setEventInterest and mobile EventService.toggleInteraction) with one atomic,
-- idempotent, target-state function that both platforms call.
--
-- Target-state, not toggle: the caller says what the row should BE, so there is
-- no select-then-write race and repeat calls are harmless.
--
-- p_force exists so the heart never needs to read the row first. The heart means
-- "ensure saved" and must not demote a 'going' row, so it passes the default
-- false. The Going button stepping back down to interested is a deliberate
-- demotion, so it passes true.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- STEP 0 — read-only pre-flight. Run this FIRST and read the output.
-- ---------------------------------------------------------------------------
-- The function below is SECURITY INVOKER, which means RLS applies to the caller.
-- That only works if authenticated users may INSERT, UPDATE and DELETE their own
-- rows. Expect policies keyed on `user_id = auth.uid()` for all three commands.
--
-- If any of the three is missing, STOP and say so — the function would need
-- SECURITY DEFINER plus its own ownership check instead, which is a different
-- design decision and needs a human call.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'user_event_relationships'
ORDER BY cmd, policyname;


-- ---------------------------------------------------------------------------
-- STEP 1 — the function.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_event_rsvp(
  p_event_id uuid,
  p_target   text,
  p_force    boolean DEFAULT false
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_result text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'set_event_rsvp: not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_target IS NOT NULL AND p_target NOT IN ('interested', 'going') THEN
    RAISE EXCEPTION 'set_event_rsvp: invalid target %', p_target USING ERRCODE = '22023';
  END IF;

  IF p_target IS NULL THEN
    DELETE FROM public.user_event_relationships
    WHERE user_id = v_user AND event_id = p_event_id;
    RETURN NULL;
  END IF;

  -- DO UPDATE always fires so RETURNING has a row to hand back, but the CASE
  -- keeps the existing value when this is an unforced 'interested' write. That
  -- is what lets the heart mean "ensure saved" without reading the row first:
  -- hearting an event the user is already going to is a no-op, not a demotion.
  INSERT INTO public.user_event_relationships (user_id, event_id, relationship_type)
  VALUES (v_user, p_event_id, p_target)
  ON CONFLICT (user_id, event_id)
  DO UPDATE SET
    relationship_type = CASE
      WHEN p_force OR p_target = 'going' THEN EXCLUDED.relationship_type
      ELSE user_event_relationships.relationship_type
    END,
    updated_at = now()
  RETURNING relationship_type INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.set_event_rsvp(uuid, text, boolean) IS
  'Sets the caller''s RSVP on an event. p_target: ''interested'', ''going'', or NULL to remove. p_force overwrites a stronger existing RSVP (used when the Going button steps back down). Returns the resulting relationship_type. Target-state and idempotent.';

REVOKE ALL ON FUNCTION public.set_event_rsvp(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_event_rsvp(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_event_rsvp(uuid, text, boolean) TO authenticated;


-- ---------------------------------------------------------------------------
-- STEP 2 — verify it registered.
-- ---------------------------------------------------------------------------
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'set_event_rsvp';

-- Then run 02_verify_set_event_rsvp.sql while signed in as a normal
-- authenticated user (NOT the service role — auth.uid() is NULL there and the
-- test will report SKIPPED).
