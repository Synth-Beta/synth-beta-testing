-- REVIEW ONLY - apply before shipping 1.4.11, or hearts stay broken.
--
-- Why an RPC and not a client UPDATE:
--   messages_update_policy is  USING (sender_id = auth.uid())  WITH CHECK (same).
--   So a client can only ever update its OWN messages. Hearting someone else's message -
--   the entire point of the feature - is filtered to zero rows by RLS, and PostgREST
--   returns 200 with no error, so it failed silently. The clients now surface that, but
--   only this function makes the write actually possible.
--
-- It also fixes a second defect for free: the client did a read-modify-write on the
-- metadata JSON, so two people reacting at the same moment lost one of the two hearts.
-- Doing the toggle inside one statement makes it atomic.
--
-- SECURITY DEFINER is required to bypass messages_update_policy, so the participant check
-- below is the real authorization gate. Do not remove it.

BEGIN;

CREATE OR REPLACE FUNCTION public.toggle_message_heart(p_message_id uuid)
RETURNS TABLE (heart_user_ids jsonb, hearted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chat_id uuid;
  v_existing jsonb;
  v_has boolean;
  v_next jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Lock the row so concurrent toggles serialize instead of overwriting each other.
  SELECT m.chat_id, COALESCE(m.metadata -> 'heart_user_ids', '[]'::jsonb)
    INTO v_chat_id, v_existing
  FROM public.messages m
  WHERE m.id = p_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: you may react to any message in a chat you belong to, which is exactly
  -- the set of messages you are allowed to read under messages_select_policy.
  IF NOT public.is_user_chat_participant(v_chat_id, v_uid) THEN
    RAISE EXCEPTION 'Not a participant of this chat' USING ERRCODE = '42501';
  END IF;

  v_has := v_existing @> to_jsonb(ARRAY[v_uid::text]);

  IF v_has THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO v_next
    FROM jsonb_array_elements(v_existing) AS elem
    WHERE elem <> to_jsonb(v_uid::text);
  ELSE
    v_next := v_existing || to_jsonb(ARRAY[v_uid::text]);
  END IF;

  UPDATE public.messages m
  SET metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object('heart_user_ids', v_next)
  WHERE m.id = p_message_id;

  RETURN QUERY SELECT v_next, NOT v_has;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_message_heart(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_message_heart(uuid) TO authenticated;

COMMIT;

-- VERIFY (run as yourself in the app, not here):
--   heart a message you did not send, reload, confirm the heart persists.
-- Read-only check that the function exists and anon cannot call it:
-- SELECT p.proname, p.prosecdef,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_call,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_call
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'toggle_message_heart';
