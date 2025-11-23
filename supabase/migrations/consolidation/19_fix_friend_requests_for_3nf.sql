-- ============================================
-- MIGRATION: Fix Friend Requests for 3NF Schema
-- ============================================
-- This migration updates friend request functions to use user_relationships
-- table instead of the old friend_requests table
-- ============================================

-- ============================================
-- PHASE 1: CREATE/UPDATE FRIEND REQUEST FUNCTIONS
-- ============================================

-- Function to create friend request using user_relationships table
CREATE OR REPLACE FUNCTION public.create_friend_request(receiver_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  relationship_id uuid;
  sender_user_id uuid;
  sender_name text;
  receiver_name text;
BEGIN
  -- Get current user ID (from auth.users)
  sender_user_id := auth.uid();
  
  IF sender_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check if receiver user exists in users table
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE user_id = receiver_user_id
  ) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check if request already exists (pending)
  IF EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE user_id = sender_user_id 
      AND related_user_id = receiver_user_id
      AND relationship_type = 'friend'
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Friend request already sent';
  END IF;

  -- Check if reverse request exists (they sent us one)
  IF EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE user_id = receiver_user_id 
      AND related_user_id = sender_user_id
      AND relationship_type = 'friend'
      AND status = 'pending'
  ) THEN
    -- Auto-accept if they already sent us one
    UPDATE public.user_relationships
    SET status = 'accepted',
        updated_at = now()
    WHERE user_id = receiver_user_id 
      AND related_user_id = sender_user_id
      AND relationship_type = 'friend'
      AND status = 'pending';

    -- Create reciprocal relationship (only if it doesn't exist)
    INSERT INTO public.user_relationships (
      user_id,
      related_user_id,
      relationship_type,
      status,
      created_at,
      updated_at
    )
    SELECT 
      sender_user_id,
      receiver_user_id,
      'friend',
      'accepted',
      now(),
      now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_relationships
      WHERE user_id = sender_user_id
        AND related_user_id = receiver_user_id
        AND relationship_type = 'friend'
    );

    RETURN NULL; -- Already accepted, no need to create notification
  END IF;
  
  -- Check if already friends
  IF EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE user_id = sender_user_id 
      AND related_user_id = receiver_user_id
      AND relationship_type = 'friend'
      AND status = 'accepted'
  ) OR EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE user_id = receiver_user_id 
      AND related_user_id = sender_user_id
      AND relationship_type = 'friend'
      AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Already friends';
  END IF;
  
  -- Create friend request in user_relationships
  INSERT INTO public.user_relationships (
    user_id,
    related_user_id,
    relationship_type,
    status,
    created_at,
    updated_at
  )
  VALUES (
    sender_user_id,
    receiver_user_id,
    'friend',
    'pending',
    now(),
    now()
  )
  RETURNING id INTO relationship_id;
  
  -- Get names for notification
  SELECT name INTO sender_name FROM public.users WHERE user_id = sender_user_id;
  SELECT name INTO receiver_name FROM public.users WHERE user_id = receiver_user_id;
  
  -- Create notification for receiver
  INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
  VALUES (
    receiver_user_id,
    'friend_request',
    'New Friend Request',
    COALESCE(sender_name, 'Someone') || ' wants to connect with you!',
    jsonb_build_object(
      'sender_id', sender_user_id,
      'request_id', relationship_id,
      'sender_name', sender_name
    ),
    sender_user_id
  );
  
  RETURN relationship_id;
END;
$$;

-- Function to accept friend request
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record RECORD;
  current_user_id uuid;
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
  
  -- Update the friend request status to accepted
  UPDATE public.user_relationships 
  SET status = 'accepted', 
      updated_at = now()
  WHERE id = request_id;
  
  -- Create reciprocal relationship (if it doesn't exist)
  INSERT INTO public.user_relationships (
    user_id,
    related_user_id,
    relationship_type,
    status,
    created_at,
    updated_at
  )
  SELECT 
    request_record.receiver_id,
    request_record.sender_id,
    'friend',
    'accepted',
    now(),
    now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_relationships
    WHERE user_id = request_record.receiver_id
      AND related_user_id = request_record.sender_id
      AND relationship_type = 'friend'
  );
  
  -- Create notification for the sender
  INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
  VALUES (
    request_record.sender_id,
    'friend_accepted',
    'Friend Request Accepted!',
    'Your friend request has been accepted.',
    jsonb_build_object('friend_id', request_record.receiver_id),
    request_record.receiver_id
  );
END;
$$;

-- Function to decline friend request
CREATE OR REPLACE FUNCTION public.decline_friend_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Update the friend request status to declined
  UPDATE public.user_relationships 
  SET status = 'declined',
      updated_at = now()
  WHERE id = request_id 
    AND related_user_id = current_user_id  -- receiver is current user
    AND relationship_type = 'friend'
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or already processed';
  END IF;
END;
$$;

-- ============================================
-- PHASE 2: GRANT EXECUTE PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.create_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_friend_request(uuid) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Friend Request Functions Updated for 3NF!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ create_friend_request - Uses user_relationships table';
  RAISE NOTICE '✅ accept_friend_request - Uses user_relationships table';
  RAISE NOTICE '✅ decline_friend_request - Uses user_relationships table';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions now use user_relationships table with:';
  RAISE NOTICE '  - related_entity_type = ''user''';
  RAISE NOTICE '  - relationship_type = ''friend''';
  RAISE NOTICE '  - status = ''pending''|''accepted''|''declined''';
  RAISE NOTICE '========================================';
END $$;

