-- Migration: Add function to mark chat as read
-- This function updates last_read_at in chat_participants with SECURITY DEFINER
-- to avoid RLS policy recursion issues

BEGIN;

-- Create function to mark a chat as read for the current user
CREATE OR REPLACE FUNCTION public.mark_chat_as_read(p_chat_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update last_read_at for the current user in this chat
  UPDATE public.chat_participants
  SET last_read_at = now()
  WHERE chat_id = p_chat_id
    AND user_id = auth.uid();
  
  -- If no row was updated, it means the user is not a participant
  -- This is fine, we just silently return
  IF NOT FOUND THEN
    RAISE NOTICE 'User % is not a participant in chat %', auth.uid(), p_chat_id;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.mark_chat_as_read(UUID) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.mark_chat_as_read(UUID) IS 
'Marks a chat as read for the current user by updating last_read_at timestamp. Uses SECURITY DEFINER to avoid RLS recursion issues.';

COMMIT;

