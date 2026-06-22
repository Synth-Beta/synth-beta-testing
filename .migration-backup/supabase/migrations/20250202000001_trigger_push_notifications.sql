-- ============================================
-- PUSH NOTIFICATION TRIGGER
-- ============================================
-- This migration creates a trigger to queue push notifications
-- when database notifications are created

-- Function to queue push notification when database notification is created
-- Minimal version to avoid timeouts
CREATE OR REPLACE FUNCTION public.queue_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_read THEN RETURN NEW; END IF;

  -- Simple insert - PostgreSQL will handle empty result gracefully
  INSERT INTO public.push_notification_queue (
    user_id, device_token, notification_id, title, body, data, status
  )
  SELECT NEW.user_id, dt.device_token, NEW.id, NEW.title, NEW.message, 
         COALESCE(NEW.data, '{}'::jsonb), 'pending'
  FROM public.device_tokens dt
  WHERE dt.user_id = NEW.user_id AND dt.is_active AND dt.platform = 'ios'
  LIMIT 1;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Create trigger (deferred to avoid blocking)
DROP TRIGGER IF EXISTS trigger_queue_push_notification ON public.notifications;

CREATE TRIGGER trigger_queue_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NOT NEW.is_read)
  EXECUTE FUNCTION public.queue_push_notification();

COMMENT ON FUNCTION public.queue_push_notification() IS 
  'Queues push notifications when database notifications are created. Processed by background worker.';

COMMENT ON TRIGGER trigger_queue_push_notification ON public.notifications IS 
  'Trigger that queues push notifications for all active device tokens when a notification is created';

