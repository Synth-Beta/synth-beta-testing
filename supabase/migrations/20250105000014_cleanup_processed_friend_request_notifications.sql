-- Create function to clean up processed friend request notifications
CREATE OR REPLACE FUNCTION public.cleanup_processed_friend_request_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete notifications for friend requests that are no longer pending
  DELETE FROM public.notifications 
  WHERE type = 'friend_request'
    AND data->>'request_id' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_requests 
      WHERE id = (data->>'request_id')::uuid 
        AND status = 'pending'
    );
END;
$$;

-- Create a trigger function to automatically clean up notifications when friend request status changes
CREATE OR REPLACE FUNCTION public.cleanup_notifications_on_friend_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the status changed from pending to something else, delete the notification
  IF OLD.status = 'pending' AND NEW.status != 'pending' THEN
    DELETE FROM public.notifications 
    WHERE type = 'friend_request'
      AND data->>'request_id' = NEW.id::text;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically clean up notifications when friend request is processed
CREATE TRIGGER cleanup_friend_request_notifications_trigger
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_notifications_on_friend_request_update();

-- Run the cleanup function once to clean up any existing processed notifications
SELECT public.cleanup_processed_friend_request_notifications();
