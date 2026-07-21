-- =============================================================================
-- 01 — Enforce dm_restricted (Restrict Direct Messages) — CHILD-SAFETY fix
-- =============================================================================
-- BUG (verified 2026-07-20): the "Restrict Direct Messages" toggle writes
-- users.dm_restricted, and it is AUTO-ENABLED for minors — but NOTHING enforces it.
-- No RLS policy and no function reads dm_restricted, so anyone can still open a DM
-- with a restricted user (including a minor). The toggle is purely cosmetic today.
--
-- MODEL: 1:1 DMs are created ONLY through public.create_direct_chat(user1, user2)
-- (SECURITY DEFINER; the RLS on chat_participants won't let a client add a *second*
-- user to a fresh chat, so this function is the single creation path). There is no
-- user→user "follow" graph in this schema; the only mutual relationship is
-- user_relationships (relationship_type='friend', status='accepted'). So "only allow
-- DMs from users you follow back (mutual followers)" == "must be accepted friends".
--
-- FIX: before creating a NEW direct chat, if EITHER participant has dm_restricted =
-- true, require that the two are accepted friends; otherwise reject. Existing chats
-- are unaffected (the early "return existing chat" path is untouched), so turning the
-- setting on never breaks conversations already in progress. Bidirectional + order-
-- independent (safest for minors; doesn't rely on which arg is the initiator).
--
-- SAFETY: replaces one SECURITY DEFINER function; only adds a guard, changes no data.
-- Idempotent / re-runnable. Review, then apply yourself.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_direct_chat(user1_id uuid, user2_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing_chat_id uuid;
  new_chat_id uuid;
  user1_exists boolean;
  user2_exists boolean;
  restricted_blocks boolean;
BEGIN
  -- Validate that both users exist
  SELECT EXISTS(SELECT 1 FROM public.users WHERE user_id = create_direct_chat.user1_id) INTO user1_exists;
  SELECT EXISTS(SELECT 1 FROM public.users WHERE user_id = create_direct_chat.user2_id) INTO user2_exists;

  IF NOT user1_exists THEN
    RAISE EXCEPTION 'User % does not exist', create_direct_chat.user1_id;
  END IF;

  IF NOT user2_exists THEN
    RAISE EXCEPTION 'User % does not exist', create_direct_chat.user2_id;
  END IF;

  -- Prevent creating chat with yourself
  IF user1_id = user2_id THEN
    RAISE EXCEPTION 'Cannot create direct chat with yourself';
  END IF;

  -- Return the existing direct chat if one already exists (restriction applies only
  -- to NEW conversations, so pre-existing threads keep working).
  SELECT c.id INTO existing_chat_id
  FROM public.chats c
  WHERE c.is_group_chat = false
    AND EXISTS (SELECT 1 FROM public.chat_participants cp1 WHERE cp1.chat_id = c.id AND cp1.user_id = user1_id)
    AND EXISTS (SELECT 1 FROM public.chat_participants cp2 WHERE cp2.chat_id = c.id AND cp2.user_id = user2_id)
    AND (SELECT COUNT(*) FROM public.chat_participants cp WHERE cp.chat_id = c.id) = 2
  LIMIT 1;

  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;

  -- ── dm_restricted enforcement ──────────────────────────────────────────────
  -- If either party restricts DMs, the two must be accepted friends to start one.
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id IN (create_direct_chat.user1_id, create_direct_chat.user2_id)
      AND u.dm_restricted = true
  ) INTO restricted_blocks;

  IF restricted_blocks THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_relationships ur
      WHERE ur.relationship_type = 'friend'
        AND ur.status = 'accepted'
        AND (
          (ur.user_id = user1_id AND ur.related_user_id = user2_id) OR
          (ur.user_id = user2_id AND ur.related_user_id = user1_id)
        )
    ) THEN
      -- 'dm_restricted' token kept in the message so the client can detect + show a
      -- friendly "this user only accepts messages from friends" state.
      RAISE EXCEPTION 'dm_restricted: recipient only accepts direct messages from friends';
    END IF;
  END IF;
  -- ───────────────────────────────────────────────────────────────────────────

  -- Create new direct chat
  INSERT INTO public.chats (chat_name, is_group_chat)
  VALUES ('Direct Chat', false)
  RETURNING id INTO new_chat_id;

  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES (new_chat_id, user1_id, now()), (new_chat_id, user2_id, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN new_chat_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise with context (this preserves the 'dm_restricted' token above).
    RAISE EXCEPTION 'Error creating direct chat: %', SQLERRM;
END;
$function$;

-- ---- VERIFY -----------------------------------------------------------------
-- 1) Function now references dm_restricted:
SELECT pg_get_functiondef(p.oid) ILIKE '%dm_restricted%' AS enforces_dm_restricted
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_direct_chat';

-- 2) Manual test (in SQL editor): pick a restricted user + a non-friend, expect the
--    call to RAISE (blocked); a friend pair should succeed.
--    SELECT public.create_direct_chat('<non-friend>', '<restricted-user>');  -- expect error
--    SELECT public.create_direct_chat('<friend>',     '<restricted-user>');  -- expect uuid

-- ---- NOTE (defense-in-depth, optional) --------------------------------------
-- The RLS on chat_participants already prevents a client from adding a *second*
-- user to a hand-rolled chat (insert allows user_id = auth.uid() OR chat admin), so
-- create_direct_chat is the only way to form a 2-person DM. If you later add other
-- DM-creation paths, replicate this check there too.
--
-- SEPARATE finding (not fixed here): create_direct_chat does NOT verify that
-- auth.uid() is one of user1_id/user2_id, so a caller could create a chat between two
-- OTHER users. Low impact today, but worth adding: `IF auth.uid() NOT IN (user1_id,
-- user2_id) THEN RAISE EXCEPTION 'not a participant'; END IF;` — left out to avoid
-- surprising any admin/automation caller; add if all callers are the end user.

-- ROLLBACK: re-create create_direct_chat from its previous definition (без the guard).
