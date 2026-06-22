-- ============================================
-- ALTERNATIVE: Push Notification Queue Function
-- ============================================
-- Use this if the trigger keeps timing out
-- This approach uses a function that can be called from your backend
-- instead of a database trigger

-- Function to queue push notifications for pending notifications
-- Call this periodically from your backend worker
CREATE OR REPLACE FUNCTION public.queue_pending_push_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  queued_count INTEGER;
BEGIN
  -- Insert notifications that need push but aren't queued yet
  INSERT INTO public.push_notification_queue (
    user_id,
    device_token,
    notification_id,
    title,
    body,
    data,
    status
  )
  SELECT DISTINCT
    n.user_id,
    dt.device_token,
    n.id,
    n.title,
    n.message,
    COALESCE(n.data, '{}'::jsonb),
    'pending'
  FROM public.notifications n
  INNER JOIN public.device_tokens dt ON dt.user_id = n.user_id
  WHERE n.is_read = false
    AND dt.is_active = true
    AND dt.platform = 'ios'
    AND NOT EXISTS (
      SELECT 1 
      FROM public.push_notification_queue pq
      WHERE pq.notification_id = n.id 
        AND pq.device_token = dt.device_token
    )
  LIMIT 100; -- Process 100 at a time

  GET DIAGNOSTICS queued_count = ROW_COUNT;
  RETURN queued_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error queueing push notifications: %', SQLERRM;
    RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.queue_pending_push_notifications() IS 
  'Queues push notifications for unread notifications. Call this periodically from backend worker.';

-- You can also create an index to speed this up
CREATE INDEX IF NOT EXISTS idx_notifications_unread_created 
  ON public.notifications(user_id, is_read, created_at DESC)
  WHERE is_read = false;


