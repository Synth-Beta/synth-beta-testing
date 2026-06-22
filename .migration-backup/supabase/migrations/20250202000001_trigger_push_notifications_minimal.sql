-- ============================================
-- PUSH NOTIFICATION TRIGGER (Minimal Version)
-- ============================================
-- This is the simplest possible version to avoid timeouts
-- Run this if other versions timeout

-- Step 1: Create minimal function (run this FIRST)
CREATE OR REPLACE FUNCTION public.queue_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Skip if already read
  IF NEW.is_read THEN
    RETURN NEW;
  END IF;

  -- Insert only if device tokens exist (minimal query)
  INSERT INTO public.push_notification_queue (
    user_id, device_token, notification_id, title, body, data, status
  )
  SELECT 
    NEW.user_id, dt.device_token, NEW.id, NEW.title, NEW.message, 
    COALESCE(NEW.data, '{}'::jsonb), 'pending'
  FROM public.device_tokens dt
  WHERE dt.user_id = NEW.user_id 
    AND dt.is_active 
    AND dt.platform = 'ios'
  LIMIT 1; -- Only queue for first device to avoid timeouts

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW; -- Don't fail notification insert
END;
$$;

-- Step 2: Create trigger (run this SECOND)
DROP TRIGGER IF EXISTS trigger_queue_push_notification ON public.notifications;

CREATE TRIGGER trigger_queue_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NOT NEW.is_read)
  EXECUTE FUNCTION public.queue_push_notification();


