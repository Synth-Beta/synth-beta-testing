-- Create function to unfriend a user
CREATE OR REPLACE FUNCTION public.unfriend_user(friend_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid;
  friendship_record public.friends%ROWTYPE;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  -- Check if the current user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to unfriend someone';
  END IF;
  
  -- Check if the friendship exists
  SELECT * INTO friendship_record
  FROM public.friends 
  WHERE (user1_id = current_user_id AND user2_id = friend_user_id)
     OR (user1_id = friend_user_id AND user2_id = current_user_id);
  
  -- If no friendship exists, raise an error
  IF friendship_record IS NULL THEN
    RAISE EXCEPTION 'Friendship does not exist';
  END IF;
  
  -- Delete the friendship record
  DELETE FROM public.friends 
  WHERE id = friendship_record.id;
  
  -- Return success
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.unfriend_user(uuid) TO authenticated;
