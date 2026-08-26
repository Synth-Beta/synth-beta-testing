-- =============================================================================
-- Chat notifications, v2 — back ON, with settings, per-chat mute, and coalescing
-- 2026-08-26
--
-- Replaces the old notify_chat_message_trigger (dropped 2026-08-25) which fired
-- one notification per message with no controls at all.
--
-- Three requirements:
--   1. Users can turn chat notifications off globally.
--   2. Users can mute an individual chat.
--   3. A burst of messages in one conversation pings ONCE, not per message.
--
-- ---------------------------------------------------------------------------
-- HOW THE COALESCING WORKS (the important bit)
--
-- The push webhook fires on INSERT into `notifications` and nothing else. So:
--
--   first message  -> INSERT a notification row  -> push fires
--   later messages -> UPDATE that same row       -> no push, bell count grows
--
-- Coalescing therefore falls out of the existing architecture for free — no
-- timers, no queue, no debounce table.
--
-- The window is "until read" rather than a fixed number of minutes: the row is
-- reopened for pushing the moment the user actually reads the chat, which is
-- what `last_read_at` already tracks. That means a user who never opens the chat
-- gets exactly one notification no matter how many messages arrive, which is the
-- intended behaviour. If you later want "re-notify after N hours of silence",
-- that is one extra condition on the coalescing lookup.
--
-- NOTE ON CONTENT: message bodies are encrypted at rest and the database cannot
-- decrypt them, so notifications carry a type label ("Sent you a message"),
-- never the message text. Changing that would require server-side decryption.
-- ---------------------------------------------------------------------------
--
-- SAFETY: two additive nullable columns, two functions, two triggers. No
-- existing row is modified except by the new read-sync trigger. Idempotent.
-- Review, then apply yourself.
-- =============================================================================
SET statement_timeout = '120s';


-- ---- 1. Settings ------------------------------------------------------------

-- Global per-user switch. Separate from enable_push_notifications, which stays
-- the master switch for push across all types.
ALTER TABLE public.user_settings_preferences
  ADD COLUMN IF NOT EXISTS enable_chat_notifications boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_settings_preferences.enable_chat_notifications IS
  'When false, chat messages create no notification at all (no push, no bell entry). Unread messages still show as the red dot on the chat icon.';

-- Per-chat mute. chat_participants already has exactly one row per (user, chat),
-- so this needs no new table and no new RLS policy.
ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS notifications_muted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chat_participants.notifications_muted IS
  'Per-user mute for one chat. Muted chats never notify; the unread red dot still updates.';


-- ---- 2. The notification trigger --------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_chat_message_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sender_name text;
  v_is_group    boolean;
  v_chat_name   text;
  v_preview     text;
  v_title       text;
  v_existing_id uuid;
  v_count       integer;
  r             RECORD;
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

  SELECT c.is_group_chat, c.chat_name
    INTO v_is_group, v_chat_name
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
      -- Per-chat mute
      AND COALESCE(cp.notifications_muted, false) = false
      -- Global chat switch (missing settings row = default on)
      AND COALESCE(usp.enable_chat_notifications, true) = true
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
      SET title      = v_title,
          message    = (v_count + 1)::text || ' new messages',
          data       = COALESCE(data, '{}'::jsonb)
                         || jsonb_build_object(
                              'chat_id',      NEW.chat_id::text,
                              'message_id',   NEW.id::text,
                              'unread_count', v_count + 1
                            ),
          created_at = now(),
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
          'chat_id',      NEW.chat_id::text,
          'message_id',   NEW.id::text,
          'actor_user_id', NEW.sender_id::text,
          'unread_count', 1
        ),
        NEW.sender_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notify_chat_message_v2_trigger ON public.messages;
CREATE TRIGGER notify_chat_message_v2_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_chat_message_v2();


-- ---- 3. Reading the chat closes the notification ----------------------------
-- Hooks the read tracking the app already maintains, so no client change is
-- needed to clear the bell — and it reopens coalescing for the next message.

CREATE OR REPLACE FUNCTION public.mark_chat_notifications_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = NEW.user_id
      AND type = 'chat_message'
      AND is_read = false
      AND (data ->> 'chat_id') = NEW.chat_id::text;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS mark_chat_notifications_read_trigger ON public.chat_participants;
CREATE TRIGGER mark_chat_notifications_read_trigger
  AFTER UPDATE ON public.chat_participants
  FOR EACH ROW EXECUTE FUNCTION public.mark_chat_notifications_read();


-- ---- 4. Index for the coalescing lookup -------------------------------------
-- The trigger runs this lookup once per recipient per message, so it must not
-- be a scan of the notifications table.
CREATE INDEX IF NOT EXISTS notifications_chat_unread_idx
  ON public.notifications (user_id, ((data ->> 'chat_id')))
  WHERE type = 'chat_message' AND is_read = false;


-- ---- 5. Retire the old function ---------------------------------------------
-- notify_chat_message_received() is superseded. Its trigger was already dropped
-- on 2026-08-25; drop the function once you are happy with v2.
--
--   DROP FUNCTION IF EXISTS public.notify_chat_message_received();


-- -----------------------------------------------------------------------------
-- Verification (read-only)
-- -----------------------------------------------------------------------------
-- a) Triggers present:
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.messages'::regclass AND NOT tgisinternal;
--   -- expect notify_chat_message_v2_trigger (plus the three keepers)
--
-- b) Send one message to a test user, then three more quickly:
--   SELECT id, title, message, data->>'unread_count' AS n, is_read, created_at
--   FROM public.notifications
--   WHERE type='chat_message' AND user_id = '<recipient>'
--   ORDER BY created_at DESC;
--   -- expect ONE row, unread_count = 4  (not four rows)
--
-- c) Open the chat as that user, then re-run (b): is_read should be true.
--    Send another message: a NEW row appears and push fires again.
--
-- d) Mute test:
--   UPDATE public.chat_participants SET notifications_muted = true
--   WHERE user_id='<recipient>' AND chat_id='<chat>';
--   -- send a message; no new notification row
