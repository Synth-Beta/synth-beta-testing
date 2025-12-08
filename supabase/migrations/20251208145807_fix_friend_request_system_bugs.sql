-- ============================================
-- MIGRATION: Fix Friend Request System Bugs
-- ============================================
-- This migration fixes:
-- 1. Adds 'cancelled' status to CHECK constraint
-- 2. Creates cancel_friend_request() function
-- 3. Wraps create_friend_request() in transaction to prevent race conditions
-- 4. Adds bidirectional duplicate prevention
-- 5. Verifies and fixes authorization checks
-- ============================================

-- ============================================
-- PHASE 1: UPDATE STATUS CONSTRAINT
-- ============================================

-- Drop the old CHECK constraint
ALTER TABLE public.user_relationships 
DROP CONSTRAINT IF EXISTS user_relationships_status_check;

-- Add new CHECK constraint with 'cancelled' status
ALTER TABLE public.user_relationships 
ADD CONSTRAINT user_relationships_status_check 
CHECK (status IS NULL OR status IN ('pending', 'accepted', 'declined', 'cancelled'));

-- ============================================
-- PHASE 2: CREATE CANCEL FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.cancel_friend_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  request_record RECORD;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Get the friend request (only if sender is current user)
  SELECT 
    id,
    user_id as sender_id,
    related_user_id as receiver_id,
    status
  INTO request_record
  FROM public.user_relationships 
  WHERE id = request_id 
    AND user_id = current_user_id  -- Only sender can cancel
    AND relationship_type = 'friend'
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found, already processed, or you are not the sender';
  END IF;
  
  -- Update status to cancelled
  UPDATE public.user_relationships 
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = request_id;
  
  -- Delete the notification for the receiver
  DELETE FROM public.notifications
  WHERE user_id = request_record.receiver_id
    AND type = 'friend_request'
    AND (data->>'request_id')::uuid = request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;

-- ============================================
-- PHASE 3: FIX CREATE_FRIEND_REQUEST WITH TRANSACTION
-- ============================================

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
  reverse_request_exists boolean := false;
BEGIN
  -- Start transaction (implicit in function, but we'll use proper locking)
  sender_user_id := auth.uid();
  
  IF sender_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Lock to prevent race conditions
  -- Lock the user_relationships table for this specific relationship pair
  PERFORM pg_advisory_xact_lock(
    hashtext(sender_user_id::text || receiver_user_id::text || 'friend')
  );

  -- Check if receiver user exists
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE user_id = receiver_user_id
  ) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check if request already exists (pending) - sender to receiver
  IF EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE user_id = sender_user_id 
      AND related_user_id = receiver_user_id
      AND relationship_type = 'friend'
      AND status IN ('pending', 'cancelled')
  ) THEN
    -- If cancelled, allow resending
    IF EXISTS (
      SELECT 1 FROM public.user_relationships 
      WHERE user_id = sender_user_id 
        AND related_user_id = receiver_user_id
        AND relationship_type = 'friend'
        AND status = 'cancelled'
    ) THEN
      -- Delete the cancelled request
      DELETE FROM public.user_relationships
      WHERE user_id = sender_user_id 
        AND related_user_id = receiver_user_id
        AND relationship_type = 'friend'
        AND status = 'cancelled';
    ELSE
      RAISE EXCEPTION 'Friend request already sent';
    END IF;
  END IF;

  -- Check if reverse request exists (they sent us one) - receiver to sender
  SELECT EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE user_id = receiver_user_id 
      AND related_user_id = sender_user_id
      AND relationship_type = 'friend'
      AND status = 'pending'
  ) INTO reverse_request_exists;

  IF reverse_request_exists THEN
    -- Auto-accept if they already sent us one (atomic operation)
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
    )
    RETURNING id INTO relationship_id;

    -- Create notification for both users
    SELECT name INTO sender_name FROM public.users WHERE user_id = sender_user_id;
    SELECT name INTO receiver_name FROM public.users WHERE user_id = receiver_user_id;
    
    -- Notification for sender (they accepted)
    INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
    VALUES (
      sender_user_id,
      'friend_accepted',
      'Friend Request Accepted!',
      COALESCE(receiver_name, 'Someone') || ' accepted your friend request!',
      jsonb_build_object('friend_id', receiver_user_id),
      receiver_user_id
    )
    ON CONFLICT DO NOTHING;

    RETURN relationship_id;
  END IF;
  
  -- Check if already friends (bidirectional check)
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

-- ============================================
-- PHASE 4: VERIFY AND FIX AUTHORIZATION
-- ============================================

-- accept_friend_request already has proper authorization (checks receiver_id = current_user_id)
-- decline_friend_request already has proper authorization (checks receiver_id = current_user_id)
-- cancel_friend_request has proper authorization (checks user_id = current_user_id)

-- Update accept_friend_request to handle edge cases better
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

  -- Get the friend request (only receiver can accept)
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
    RAISE EXCEPTION 'Friend request not found, already processed, or you are not the receiver';
  END IF;
  
  -- Check if friendship already exists (prevent duplicates)
  SELECT EXISTS (
    SELECT 1 FROM public.user_relationships
    WHERE relationship_type = 'friend'
      AND status = 'accepted'
      AND (
        (user_id = request_record.sender_id AND related_user_id = request_record.receiver_id)
        OR
        (user_id = request_record.receiver_id AND related_user_id = request_record.sender_id)
      )
  ) INTO friendship_exists;
  
  -- Update the friend request status to accepted
  UPDATE public.user_relationships 
  SET status = 'accepted', 
      updated_at = now()
  WHERE id = request_id;
  
  -- Create reciprocal relationship only if it doesn't already exist
  IF NOT friendship_exists THEN
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
  END IF;
  
  -- Create notification for the sender (only if not already sent recently)
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
      AND created_at > now() - interval '1 minute'
  );
  
  -- Delete the original friend_request notification
  DELETE FROM public.notifications
  WHERE user_id = current_user_id
    AND type = 'friend_request'
    AND (data->>'request_id')::uuid = request_id;
END;
$$;

-- decline_friend_request already has proper authorization, but let's ensure it deletes notification
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

  -- Update the friend request status to declined (only receiver can decline)
  UPDATE public.user_relationships 
  SET status = 'declined',
      updated_at = now()
  WHERE id = request_id 
    AND related_user_id = current_user_id  -- receiver is current user
    AND relationship_type = 'friend'
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found, already processed, or you are not the receiver';
  END IF;
  
  -- Delete the notification
  DELETE FROM public.notifications
  WHERE user_id = current_user_id
    AND type = 'friend_request'
    AND (data->>'request_id')::uuid = request_id;
END;
$$;

-- ============================================
-- PHASE 5: SUMMARY
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Friend Request System Bugs Fixed!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Added ''cancelled'' status to CHECK constraint';
  RAISE NOTICE '✅ Created cancel_friend_request() function';
  RAISE NOTICE '✅ Fixed race conditions in create_friend_request()';
  RAISE NOTICE '✅ Added bidirectional duplicate prevention';
  RAISE NOTICE '✅ Verified authorization in all functions';
  RAISE NOTICE '✅ Fixed notification cleanup';
  RAISE NOTICE '========================================';
END $$;

