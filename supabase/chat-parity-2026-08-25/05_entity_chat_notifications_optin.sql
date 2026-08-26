-- =============================================================================
-- Chat notifications v2.1 — genre / event / artist / venue rooms are opt-IN
-- 2026-08-26
--
-- Delta on 04_chat_notifications_v2.sql (already applied). Adds the third
-- notification switch and teaches the trigger about entity rooms.
--
-- The three switches, most-general first:
--
--   user_settings_preferences.enable_push_notifications      default TRUE
--       Master push switch, all notification types. Already existed and is
--       already enforced by both push paths. Off = no push at all; bell still
--       fills normally.
--
--   user_settings_preferences.enable_chat_notifications      default TRUE
--       Chat messages create notifications at all. Off = no push AND no bell
--       entry for any chat. Unread red dot still works.
--
--   user_settings_preferences.enable_entity_chat_notifications  default FALSE
--       Genre / event / artist / venue / scene rooms specifically. These can
--       have hundreds of members, so they are silent unless a user opts in.
--       Direct chats and ordinary group chats are unaffected.
--
--   chat_participants.notifications_muted                    default FALSE
--       Per-chat override, beats all of the above for that one chat.
--
-- Why a settings flag rather than backfilling notifications_muted on every
-- existing entity-room membership: a backfill is a large one-time write that
-- silently loses the user's intent the moment they join a new room, and it
-- cannot be un-done centrally. A default-false column applies to existing and
-- future memberships alike, needs no data migration, and still leaves
-- notifications_muted free to mean "this specific room", which is what the
-- per-chat mute UI writes.
--
-- SAFETY: one additive column, one function replacement. No row is modified.
-- Idempotent. Review, then apply yourself.
-- =============================================================================
SET statement_timeout = '120s';


-- ---- 1. The entity-room switch ----------------------------------------------

ALTER TABLE public.user_settings_preferences
  ADD COLUMN IF NOT EXISTS enable_entity_chat_notifications boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_settings_preferences.enable_entity_chat_notifications IS
  'Notifications for genre/event/artist/venue/scene rooms. Default FALSE — these rooms are high-volume, so they are opt-in. Direct and ordinary group chats are governed by enable_chat_notifications instead.';


-- ---- 2. Trigger: skip entity rooms unless opted in --------------------------
-- Same as v2 except the chat's entity_type is now read and applied to the
-- recipient filter.

CREATE OR REPLACE FUNCTION public.notify_chat_message_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sender_name  text;
  v_is_group     boolean;
  v_chat_name    text;
  v_entity_type  text;
  v_preview      text;
  v_title        text;
  v_existing_id  uuid;
  v_count        integer;
  r              RECORD;
BEGIN
  -- Bot / system messages never notify.
  IF NEW.author_type IS NOT NULL AND NEW.author_type <> 'human' THEN
    RETURN NEW;
  END IF;
  IF NEW.message_type = 'system' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
           NULLIF(TRIM(u.name), ''),
           NULLIF('@' || TRIM(u.username), '@'),
           'Someone'
         )
    INTO v_sender_name
  FROM public.users u
  WHERE u.user_id = NEW.sender_id;

  SELECT c.is_group_chat, c.chat_name, c.entity_type
    INTO v_is_group, v_chat_name, v_entity_type
  FROM public.chats c
  WHERE c.id = NEW.chat_id;

  -- Content is encrypted; describe the message instead of quoting it.
  v_preview := CASE NEW.message_type
                 WHEN 'image'        THEN 'Sent a photo'
                 WHEN 'event_share'  THEN 'Shared an event'
                 WHEN 'review_share' THEN 'Shared a review'
                 ELSE 'Sent you a message'
               END;

  v_title := CASE
               WHEN COALESCE(v_is_group, false) AND COALESCE(TRIM(v_chat_name), '') <> ''
                 THEN v_sender_name || ' in ' || v_chat_name
               ELSE v_sender_name
             END;

  FOR r IN
    SELECT cp.user_id
    FROM public.chat_participants cp
    LEFT JOIN public.user_settings_preferences usp ON usp.user_id = cp.user_id
    WHERE cp.chat_id = NEW.chat_id
      AND cp.user_id <> NEW.sender_id
      -- Per-chat mute beats everything else.
      AND COALESCE(cp.notifications_muted, false) = false
      -- Global chat switch (missing settings row = default on).
      AND COALESCE(usp.enable_chat_notifications, true) = true
      -- Entity rooms are opt-in; direct/ordinary group chats are not affected.
      AND (
        v_entity_type IS NULL
        OR COALESCE(usp.enable_entity_chat_notifications, false) = true
      )
  LOOP
    -- Coalesce: reuse this recipient's existing unread notification for THIS chat.
    SELECT n.id,
           COALESCE((n.data ->> 'unread_count')::int, 1)
      INTO v_existing_id, v_count
    FROM public.notifications n
    WHERE n.user_id = r.user_id
      AND n.type = 'chat_message'
      AND n.is_read = false
      AND (n.data ->> 'chat_id') = NEW.chat_id::text
    ORDER BY n.created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- UPDATE, never INSERT: the push webhook is INSERT-triggered, so this
      -- grows the bell entry without pinging the phone a second time.
      UPDATE public.notifications
      SET title         = v_title,
          message       = (v_count + 1)::text || ' new messages',
          data          = COALESCE(data, '{}'::jsonb)
                            || jsonb_build_object(
                                 'chat_id',      NEW.chat_id::text,
                                 'message_id',   NEW.id::text,
                                 'unread_count', v_count + 1
                               ),
          created_at    = now(),
          actor_user_id = NEW.sender_id
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
      VALUES (
        r.user_id,
        'chat_message',
        v_title,
        v_preview,
        jsonb_build_object(
          'chat_id',       NEW.chat_id::text,
          'message_id',    NEW.id::text,
          'actor_user_id', NEW.sender_id::text,
          'unread_count',  1,
          'entity_type',   v_entity_type
        ),
        NEW.sender_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;


-- -----------------------------------------------------------------------------
-- Verification (read-only)
-- -----------------------------------------------------------------------------
-- a) Column exists and defaults false:
--   SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='user_settings_preferences'
--     AND column_name LIKE '%chat_notifications%';
--
-- b) Post a message in a genre room. With the default (opt-out), expect NO new
--    row for any recipient:
--   SELECT count(*) FROM public.notifications
--   WHERE type='chat_message' AND created_at > now() - interval '2 minutes';
--   -- expect 0
--
-- c) Opt one user in, post again, expect exactly one row for them:
--   UPDATE public.user_settings_preferences
--   SET enable_entity_chat_notifications = true WHERE user_id='<recipient>';
--
-- d) Direct chats must be unaffected throughout — post in a 1:1 and confirm a
--    row still appears without any opt-in.
