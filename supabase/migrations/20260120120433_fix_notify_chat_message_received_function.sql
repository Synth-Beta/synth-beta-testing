-- ============================================================
-- Fix notify_chat_message_received Function
-- ============================================================
-- The function is referenced by the notify_chat_message_trigger
-- but may be missing or using outdated column names (c.name instead of c.chat_name)
-- and the removed chats.users array.
-- 
-- This migration creates or fixes the function to:
-- 1. Use chat_name instead of name
-- 2. Use chat_participants table instead of chats.users array
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Drop existing function if it exists (to recreate with fixes)
-- ============================================================

DROP FUNCTION IF EXISTS public.notify_chat_message_received() CASCADE;

-- ============================================================
-- STEP 2: Create the fixed function
-- ============================================================
-- This function creates notifications for chat participants when a message is received
-- It uses chat_participants table (3NF compliant) instead of chats.users array

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

  -- Notify all participants except the sender
  -- Use chat_participants table (3NF compliant) instead of chats.users array
  FOR v_chat_participant_id IN
    SELECT user_id
    FROM public.chat_participants
    WHERE chat_id = NEW.chat_id
      AND user_id != NEW.sender_id
  LOOP
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
      COALESCE(v_sender_name, 'Someone') || ': ' || LEFT(NEW.content, 100),
      jsonb_build_object(
        'chat_id', NEW.chat_id,
        'message_id', NEW.id,
        'sender_id', NEW.sender_id,
        'sender_name', v_sender_name,
        'sender_avatar', v_sender_avatar,
        'chat_name', v_chat_name,
        'message_preview', LEFT(NEW.content, 200)
      ),
      NEW.sender_id,
      now()
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the message insert
  RAISE WARNING 'Error in notify_chat_message_received: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_chat_message_received IS 
'Creates notifications for chat participants when a text message is received. Uses chat_participants table (3NF compliant) instead of chats.users array.';

-- ============================================================
-- STEP 3: Ensure the trigger exists (it should already exist from schema)
-- ============================================================
-- The trigger is defined in the schema as:
-- CREATE TRIGGER notify_chat_message_trigger
-- AFTER INSERT ON messages FOR EACH ROW
-- WHEN (new.message_type IS NULL OR new.message_type = 'text'::text)
-- EXECUTE FUNCTION notify_chat_message_received();

-- Just verify it exists, don't recreate if it does
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'notify_chat_message_trigger'
    AND tgrelid = 'public.messages'::regclass
  ) THEN
    -- Create the trigger if it doesn't exist
    CREATE TRIGGER notify_chat_message_trigger
    AFTER INSERT ON public.messages
    FOR EACH ROW
    WHEN (
      NEW.message_type IS NULL
      OR NEW.message_type = 'text'::text
    )
    EXECUTE FUNCTION public.notify_chat_message_received();
    
    RAISE NOTICE '✅ Created notify_chat_message_trigger';
  ELSE
    RAISE NOTICE '✅ Trigger notify_chat_message_trigger already exists';
  END IF;
END $$;

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Fixed notify_chat_message_received function:';
  RAISE NOTICE '  1. ✅ Uses chat_name instead of name';
  RAISE NOTICE '  2. ✅ Uses chat_participants table (3NF compliant)';
  RAISE NOTICE '  3. ✅ Handles errors gracefully';
  RAISE NOTICE '================================================';
END $$;

COMMIT;
