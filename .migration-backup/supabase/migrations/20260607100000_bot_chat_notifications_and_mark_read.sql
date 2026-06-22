-- Bot chat notifications: skip per-message spam from seed bots; add mark-read RPCs.

BEGIN;

-- ============================================================
-- Mark notification read (web notificationService expects this RPC)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_notification_read(notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE id = notification_id
    AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = auth.uid()
    AND is_read = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ============================================================
-- Skip bot seed traffic; real users get normal 1:1 chat alerts
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_chat_message_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_avatar TEXT;
  v_sender_is_bot BOOLEAN;
  v_chat_name TEXT;
  v_chat_participant_id UUID;
  v_is_bot_seed BOOLEAN;
BEGIN
  IF NEW.message_type IS NOT NULL AND NEW.message_type != 'text' THEN
    RETURN NEW;
  END IF;

  v_is_bot_seed := COALESCE((NEW.metadata->>'bot_seed')::boolean, false);

  SELECT name, avatar_url, COALESCE(is_bot, false)
  INTO v_sender_name, v_sender_avatar, v_sender_is_bot
  FROM public.users
  WHERE user_id = NEW.sender_id;

  -- Bot seed messages never fan out per-message notifications
  IF v_sender_is_bot OR v_is_bot_seed THEN
    RETURN NEW;
  END IF;

  SELECT chat_name INTO v_chat_name
  FROM public.chats
  WHERE id = NEW.chat_id;

  FOR v_chat_participant_id IN
    SELECT user_id
    FROM public.chat_participants
    WHERE chat_id = NEW.chat_id
      AND user_id IS DISTINCT FROM NEW.sender_id
  LOOP
    IF v_chat_participant_id = NEW.sender_id THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      actor_user_id,
      created_at
    ) VALUES (
      v_chat_participant_id,
      'chat_message',
      COALESCE(v_chat_name, 'New Message'),
      'New message from ' || COALESCE(v_sender_name, 'Someone'),
      jsonb_build_object(
        'chat_id', NEW.chat_id,
        'message_id', NEW.id,
        'sender_id', NEW.sender_id,
        'sender_name', v_sender_name,
        'sender_avatar', v_sender_avatar,
        'chat_name', v_chat_name
      ),
      NEW.sender_id,
      now()
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in notify_chat_message_received: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_chat_message_received IS
'Notifies chat participants on real user text messages. Skips is_bot senders and metadata.bot_seed messages.';

COMMIT;
