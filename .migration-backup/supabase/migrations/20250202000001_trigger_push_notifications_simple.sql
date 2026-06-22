-- ============================================
-- PUSH NOTIFICATION TRIGGER (Simplified Version)
-- ============================================
-- Run this if the full migration times out
-- This version is optimized for performance

-- Step 1: Create the function (run this first)
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
  -- Using a simple INSERT with SELECT - PostgreSQL will optimize this
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
  LIMIT 10; -- Limit to 10 devices per user to prevent timeouts

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the notification insert
    RAISE WARNING 'Error queueing push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Step 2: Create the trigger (run this second, after function is created)
-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_queue_push_notification ON public.notifications;

-- Create trigger
CREATE TRIGGER trigger_queue_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.is_read = false)
  EXECUTE FUNCTION public.queue_push_notification();

-- Step 3: Add comments
COMMENT ON FUNCTION public.queue_push_notification() IS 
  'Queues push notifications when database notifications are created. Processed by background worker.';

COMMENT ON TRIGGER trigger_queue_push_notification ON public.notifications IS 
  'Trigger that queues push notifications for all active device tokens when a notification is created';


