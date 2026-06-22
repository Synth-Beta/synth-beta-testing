-- ============================================
-- Chat & Profile Notification Fixes
-- ============================================
-- 1. Chat: ensure sender never gets notification; use "New message" without content (encrypted)
-- 2. Remove artist_profile_updated and venue_profile_updated types
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Update notify_chat_message_received
-- ============================================
CREATE OR REPLACE FUNCTION public.notify_chat_message_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_avatar TEXT;
  v_chat_name TEXT;
  v_chat_participant_id UUID;
BEGIN
  -- Only process text messages (not event shares, which have their own trigger)
  IF NEW.message_type IS NOT NULL AND NEW.message_type != 'text' THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT name, avatar_url INTO v_sender_name, v_sender_avatar
  FROM public.users
  WHERE user_id = NEW.sender_id;

  -- Get chat name
  SELECT chat_name INTO v_chat_name
  FROM public.chats
  WHERE id = NEW.chat_id;

  -- Notify all participants EXCEPT the sender (explicit safeguard - never notify sender)
  -- Do NOT include message content - messages are encrypted, would show gibberish
  FOR v_chat_participant_id IN
    SELECT user_id
    FROM public.chat_participants
    WHERE chat_id = NEW.chat_id
      AND user_id IS DISTINCT FROM NEW.sender_id
  LOOP
    -- Extra safety: never notify the sender
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
'Creates notifications for chat recipients (never sender). No message content - messages are encrypted.';

-- ============================================
-- STEP 2: Remove artist_profile_updated and venue_profile_updated
-- ============================================
-- Delete existing notifications of these types before dropping from constraint
DELETE FROM public.notifications WHERE type IN ('artist_profile_updated', 'venue_profile_updated');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'notifications'
    AND constraint_name LIKE '%notifications_type_check%'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  END IF;

  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request',
    'friend_accepted',
    'match',
    'message',
    'chat_message',
    'review_liked',
    'review_commented',
    'comment_replied',
    'event_interest',
    'artist_followed',
    'artist_new_event',
    'venue_new_event',
    'bucket_list_new_event',
    'friend_tagged_in_review',
    'follows_new_events_summary',
    'friends_event_interest_summary',
    'bucket_list_new_events_summary'
  ));
END $$;

COMMIT;
