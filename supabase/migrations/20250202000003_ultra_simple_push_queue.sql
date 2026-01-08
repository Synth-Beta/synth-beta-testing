-- ============================================
-- ULTRA SIMPLE: Push Notification Queue Function
-- ============================================
-- This is the absolute simplest version
-- No trigger - just a function you call from backend

-- Step 1: Create the simplest possible function
CREATE OR REPLACE FUNCTION public.queue_pending_push_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO push_notification_queue (
    user_id, device_token, notification_id, title, body, data, status
  )
  SELECT 
    n.user_id, dt.device_token, n.id, n.title, n.message, 
    COALESCE(n.data, '{}'), 'pending'
  FROM notifications n
  JOIN device_tokens dt ON dt.user_id = n.user_id
  WHERE n.is_read = false
    AND dt.is_active = true
    AND dt.platform = 'ios'
    AND NOT EXISTS (
      SELECT 1 FROM push_notification_queue pq
      WHERE pq.notification_id = n.id AND pq.device_token = dt.device_token
    )
  LIMIT 50;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$;


