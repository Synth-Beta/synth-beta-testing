-- Fix accept_friend_request function to handle duplicate friendship constraint
-- The unique_friendship_bidirectional constraint prevents duplicate friendships
-- This migration updates the function to properly handle cases where friendship already exists

CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record RECORD;
  current_user_id uuid;
  friendship_exists boolean := false;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Get the friend request
  SELECT 
    id,
    user_id as sender_id,
    related_user_id as receiver_id,
    status
  INTO request_record
  FROM public.user_relationships 
  WHERE id = request_id 
    AND related_user_id = current_user_id  -- receiver is current user
    AND relationship_type = 'friend'
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or already processed';
  END IF;
  
  -- Check if friendship already exists (using the same logic as the unique constraint)
  SELECT EXISTS (
    SELECT 1 FROM public.user_relationships
    WHERE relationship_type = 'friend'
      AND status = 'accepted'
      AND (
        (user_id = LEAST(request_record.sender_id, request_record.receiver_id)
         AND related_user_id = GREATEST(request_record.sender_id, request_record.receiver_id))
        OR
        (user_id = GREATEST(request_record.sender_id, request_record.receiver_id)
         AND related_user_id = LEAST(request_record.sender_id, request_record.receiver_id))
      )
  ) INTO friendship_exists;
  
  -- Update the friend request status to accepted
  UPDATE public.user_relationships 
  SET status = 'accepted', 
      updated_at = now()
  WHERE id = request_id;
  
  -- Create reciprocal relationship only if it doesn't already exist
  IF NOT friendship_exists THEN
    BEGIN
      INSERT INTO public.user_relationships (
        user_id,
        related_user_id,
        relationship_type,
        status,
        created_at,
        updated_at
      )
      VALUES (
        request_record.receiver_id,
        request_record.sender_id,
        'friend',
        'accepted',
        now(),
        now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        -- Friendship already exists, ignore the error
        NULL;
    END;
  END IF;
  
  -- Create notification for the sender (only if not already sent)
  INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
  SELECT 
    request_record.sender_id,
    'friend_accepted',
    'Friend Request Accepted!',
    'Your friend request has been accepted.',
    jsonb_build_object('friend_id', request_record.receiver_id),
    request_record.receiver_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = request_record.sender_id
      AND type = 'friend_accepted'
      AND (data->>'friend_id')::uuid = request_record.receiver_id
      AND created_at > now() - interval '1 minute'  -- Avoid duplicate notifications within 1 minute
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_friend_request IS 'Accepts a friend request and creates reciprocal friendship. Handles duplicate friendship constraint gracefully.';

