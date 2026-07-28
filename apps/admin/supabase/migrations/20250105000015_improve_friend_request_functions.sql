-- Update accept_friend_request function to clean up notifications
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record public.friend_requests%ROWTYPE;
BEGIN
  -- Get the friend request
  SELECT * INTO request_record 
  FROM public.friend_requests 
  WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or already processed';
  END IF;
  
  -- Update the friend request status
  UPDATE public.friend_requests 
  SET status = 'accepted', updated_at = now()
  WHERE id = request_id;
  
  -- Create friendship (ensure consistent ordering)
  INSERT INTO public.friends (user1_id, user2_id)
  VALUES (
    LEAST(request_record.sender_id, request_record.receiver_id),
    GREATEST(request_record.sender_id, request_record.receiver_id)
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING;
  
  -- Create notification for the sender
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    request_record.sender_id,
    'friend_accepted',
    'Friend Request Accepted!',
    'Your friend request has been accepted.',
    jsonb_build_object('friend_id', request_record.receiver_id)
  );
  
  -- The trigger will automatically clean up the original friend_request notification
  -- No need to manually delete it here
END;
$$;

-- Update decline_friend_request function to clean up notifications
CREATE OR REPLACE FUNCTION public.decline_friend_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the friend request status
  UPDATE public.friend_requests 
  SET status = 'declined', updated_at = now()
  WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or already processed';
  END IF;
  
  -- The trigger will automatically clean up the friend_request notification
  -- No need to manually delete it here
END;
$$;
