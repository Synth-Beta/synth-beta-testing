-- Create friend_requests table
CREATE TABLE public.friend_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

-- Enable RLS
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for friend_requests
CREATE POLICY "Users can view friend requests they sent or received" ON public.friend_requests 
FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can create friend requests" ON public.friend_requests 
FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update friend requests they received" ON public.friend_requests 
FOR UPDATE USING (auth.uid() = receiver_id);

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('friend_request', 'friend_accepted', 'match', 'message')),
  title text NOT NULL,
  message text NOT NULL,
  data jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create policies for notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON public.notifications 
FOR UPDATE USING (auth.uid() = user_id);

-- Create friends table (for accepted friend requests)
CREATE TABLE public.friends (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id) -- Ensure consistent ordering
);

-- Enable RLS
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Create policies for friends
CREATE POLICY "Users can view their friends" ON public.friends 
FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Create function to handle friend request acceptance
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
END;
$$;

-- Create function to create friend request with notification
CREATE OR REPLACE FUNCTION public.create_friend_request(receiver_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id uuid;
  sender_name text;
  receiver_name text;
  receiver_email text;
BEGIN
  -- Check if receiver user exists in auth.users
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = receiver_user_id
  ) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check if request already exists
  IF EXISTS (
    SELECT 1 FROM public.friend_requests 
    WHERE sender_id = auth.uid() AND receiver_id = receiver_user_id
  ) THEN
    RAISE EXCEPTION 'Friend request already sent';
  END IF;
  
  -- Check if already friends
  IF EXISTS (
    SELECT 1 FROM public.friends 
    WHERE (user1_id = auth.uid() AND user2_id = receiver_user_id) 
    OR (user1_id = receiver_user_id AND user2_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Already friends';
  END IF;
  
  -- Create friend request
  INSERT INTO public.friend_requests (sender_id, receiver_id)
  VALUES (auth.uid(), receiver_user_id)
  RETURNING id INTO request_id;
  
  -- Get names and email for notification
  SELECT name INTO sender_name FROM public.profiles WHERE user_id = auth.uid();
  SELECT name INTO receiver_name FROM public.profiles WHERE user_id = receiver_user_id;
  SELECT email INTO receiver_email FROM auth.users WHERE id = receiver_user_id;
  
  -- Create notification for receiver
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    receiver_user_id,
    'friend_request',
    'New Friend Request',
    COALESCE(sender_name, 'Someone') || ' wants to connect with you!',
    jsonb_build_object('sender_id', auth.uid(), 'request_id', request_id)
  );
  
  -- Send email notification (this will be handled by the frontend)
  -- The email sending will be triggered by the frontend after this function returns
  
  RETURN request_id;
END;
$$;

-- Create function to decline friend request
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
END;
$$;

-- Create trigger to update updated_at on friend_requests
CREATE TRIGGER update_friend_requests_updated_at
  BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
