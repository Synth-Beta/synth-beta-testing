-- ============================================
-- PUSH NOTIFICATION TRIGGER (Step-by-Step)
-- ============================================
-- Run these commands ONE AT A TIME if you're getting timeouts
-- Copy and paste each section separately into Supabase SQL editor

-- ============================================
-- STEP 1: Create the function (run this first)
-- ============================================
CREATE OR REPLACE FUNCTION public.queue_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only queue push notifications for unread notifications
  IF NEW.is_read = true THEN
    RETURN NEW;
  END IF;

  -- Insert into push notification queue for all active device tokens
  INSERT INTO public.push_notification_queue (
    user_id,
    device_token,
    notification_id,
    title,
    body,
    data,
    status
  )
  SELECT 
    NEW.user_id,
    dt.device_token,
    NEW.id,
    NEW.title,
    NEW.message,
    COALESCE(NEW.data, '{}'::jsonb),
    'pending'
  FROM public.device_tokens dt
  WHERE dt.user_id = NEW.user_id
    AND dt.is_active = true
    AND dt.platform = 'ios'
  LIMIT 10;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error queueing push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================
-- STEP 2: Drop existing trigger if it exists
-- ============================================
DROP TRIGGER IF EXISTS trigger_queue_push_notification ON public.notifications;

-- ============================================
-- STEP 3: Create the trigger
-- ============================================
CREATE TRIGGER trigger_queue_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.is_read = false)
  EXECUTE FUNCTION public.queue_push_notification();

-- ============================================
-- STEP 4: Add comments (optional)
-- ============================================
COMMENT ON FUNCTION public.queue_push_notification() IS 
  'Queues push notifications when database notifications are created. Processed by background worker.';

COMMENT ON TRIGGER trigger_queue_push_notification ON public.notifications IS 
  'Trigger that queues push notifications for all active device tokens when a notification is created';


