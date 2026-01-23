-- ============================================
-- FIX PUSH NOTIFICATION USER PREFERENCES CHECK
-- ============================================
-- This migration updates the queue_push_notification() function
-- to respect user_settings_preferences.enable_push_notifications
-- before queueing push notifications.

-- Step 1: Update the function to check user preferences
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
  -- BUT ONLY if user has enable_push_notifications = true (or NULL, which defaults to true)
  -- Using a LEFT JOIN to handle cases where user_settings_preferences doesn't exist yet
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
  LEFT JOIN public.user_settings_preferences usp ON usp.user_id = dt.user_id
  WHERE dt.user_id = NEW.user_id
    AND dt.is_active = true
    AND dt.platform = 'ios'
    -- Only queue if push notifications are enabled (true) or not set (NULL, which defaults to true)
    AND (usp.enable_push_notifications = true OR usp.enable_push_notifications IS NULL)
  LIMIT 10; -- Limit to 10 devices per user to prevent timeouts

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the notification insert
    RAISE WARNING 'Error queueing push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Step 2: Ensure the trigger exists (it should already exist, but verify)
DO $$
BEGIN
  -- Check if trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_queue_push_notification'
    AND tgrelid = 'public.notifications'::regclass
  ) THEN
    -- Create trigger if it doesn't exist
    CREATE TRIGGER trigger_queue_push_notification
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    WHEN (NEW.is_read = false)
    EXECUTE FUNCTION public.queue_push_notification();
    
    RAISE NOTICE '✅ Created trigger_queue_push_notification';
  ELSE
    RAISE NOTICE '✅ Trigger trigger_queue_push_notification already exists';
  END IF;
END $$;

-- Step 3: Update comments
COMMENT ON FUNCTION public.queue_push_notification() IS 
  'Queues push notifications when database notifications are created. Respects user_settings_preferences.enable_push_notifications. Processed by background worker.';

COMMENT ON TRIGGER trigger_queue_push_notification ON public.notifications IS 
  'Trigger that queues push notifications for all active device tokens when a notification is created, only if user has push notifications enabled';

-- Step 4: Verification queries (for manual checking)
-- Uncomment these to verify the trigger and function exist:
-- SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger WHERE tgname = 'trigger_queue_push_notification';
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'queue_push_notification';
