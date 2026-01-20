-- ============================================================
-- Fix RLS Recursion in chat_participants Policies
-- ============================================================
-- The issue: Policies on chat_participants query chat_participants itself,
-- causing infinite recursion after chats.users array was removed.
-- 
-- Solution: Use a SECURITY DEFINER function to check membership,
-- which bypasses RLS and breaks the recursion cycle.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Create SECURITY DEFINER function to check membership
-- ============================================================
-- This function bypasses RLS to check if a user is a participant in a chat
-- without triggering the RLS policies recursively

CREATE OR REPLACE FUNCTION public.is_user_chat_participant(
  p_chat_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Check if user is a participant in the chat
  -- SECURITY DEFINER allows this to bypass RLS
  RETURN EXISTS (
    SELECT 1 
    FROM public.chat_participants cp
    WHERE cp.chat_id = p_chat_id
    AND cp.user_id = p_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.is_user_chat_participant IS 
'Checks if a user is a participant in a chat. Uses SECURITY DEFINER to bypass RLS and prevent recursion.';

-- ============================================================
-- STEP 2: Update chat_participants RLS policies to use the function
-- ============================================================

-- Drop existing recursive policies
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;

-- SELECT: Users can see participants if:
-- 1. They are the participant themselves (user_id = auth.uid())
-- 2. OR they are a participant in the chat (checked via SECURITY DEFINER function, no recursion)
CREATE POLICY "chat_participants_select" ON public.chat_participants
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_user_chat_participant(chat_participants.chat_id, auth.uid())
  );

-- INSERT: Users can only add themselves (security: prevents random members from adding others)
-- For invites/additions by other members, use add_user_to_verified_chat() function instead
CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can update their own participation OR if they are in the chat
-- (checked via SECURITY DEFINER function, no recursion)
CREATE POLICY "chat_participants_update" ON public.chat_participants
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_user_chat_participant(chat_participants.chat_id, auth.uid())
  );

-- DELETE: Users can remove their own participation OR if they are in the chat
-- (checked via SECURITY DEFINER function, no recursion)
CREATE POLICY "chat_participants_delete" ON public.chat_participants
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_user_chat_participant(chat_participants.chat_id, auth.uid())
  );

COMMENT ON POLICY "chat_participants_select" ON public.chat_participants IS 
'Users can see participants in chats they are members of. Uses SECURITY DEFINER function to avoid RLS recursion.';

COMMENT ON POLICY "chat_participants_insert" ON public.chat_participants IS 
'Users can only add themselves to chats. For adding others, use add_user_to_verified_chat() function.';

COMMENT ON POLICY "chat_participants_update" ON public.chat_participants IS 
'Users can update their own participation or if they are in the chat. Uses SECURITY DEFINER function to avoid RLS recursion.';

COMMENT ON POLICY "chat_participants_delete" ON public.chat_participants IS 
'Users can remove their own participation or if they are in the chat. Uses SECURITY DEFINER function to avoid RLS recursion.';

-- ============================================================
-- STEP 3: Update chats RLS policies to use the function (for consistency)
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "chats_select_policy" ON public.chats;
DROP POLICY IF EXISTS "chats_update_policy" ON public.chats;
DROP POLICY IF EXISTS "chats_delete_policy" ON public.chats;

-- SELECT: Users can view chats where they are participants
CREATE POLICY "chats_select_policy" ON public.chats
  FOR SELECT
  USING (
    public.is_user_chat_participant(chats.id, auth.uid())
  );

-- UPDATE: Users can update chats where they are participants
CREATE POLICY "chats_update_policy" ON public.chats
  FOR UPDATE
  USING (
    public.is_user_chat_participant(chats.id, auth.uid())
  );

-- DELETE: Users can delete chats where they are participants
CREATE POLICY "chats_delete_policy" ON public.chats
  FOR DELETE
  USING (
    public.is_user_chat_participant(chats.id, auth.uid())
  );

COMMENT ON POLICY "chats_select_policy" ON public.chats IS 
'Users can view chats where they are participants. Uses SECURITY DEFINER function to avoid RLS recursion.';

COMMENT ON POLICY "chats_update_policy" ON public.chats IS 
'Users can update chats where they are participants. Uses SECURITY DEFINER function to avoid RLS recursion.';

COMMENT ON POLICY "chats_delete_policy" ON public.chats IS 
'Users can delete chats where they are participants. Uses SECURITY DEFINER function to avoid RLS recursion.';

-- ============================================================
-- STEP 4: Update messages RLS policies to use the function (for consistency)
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages;
DROP POLICY IF EXISTS "messages_update_policy" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_policy" ON public.messages;

-- SELECT: Users can view messages in chats where they are participants
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT
  USING (
    public.is_user_chat_participant(messages.chat_id, auth.uid())
  );

-- INSERT: Users can send messages in chats where they are participants
CREATE POLICY "messages_insert_policy" ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_user_chat_participant(messages.chat_id, auth.uid())
  );

COMMENT ON POLICY "messages_select_policy" ON public.messages IS 
'Users can view messages in chats where they are participants. Uses SECURITY DEFINER function to avoid RLS recursion.';

COMMENT ON POLICY "messages_insert_policy" ON public.messages IS 
'Users can send messages in chats where they are participants. Uses SECURITY DEFINER function to avoid RLS recursion.';

-- UPDATE: Users can update their own messages
CREATE POLICY "messages_update_policy" ON public.messages
  FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- DELETE: Users can delete their own messages
CREATE POLICY "messages_delete_policy" ON public.messages
  FOR DELETE
  USING (sender_id = auth.uid());

COMMENT ON POLICY "messages_update_policy" ON public.messages IS 
'Users can update their own messages.';

COMMENT ON POLICY "messages_delete_policy" ON public.messages IS 
'Users can delete their own messages.';

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Fixed chat_participants RLS recursion:';
  RAISE NOTICE '  1. ✅ Created is_user_chat_participant() SECURITY DEFINER function';
  RAISE NOTICE '  2. ✅ Updated chat_participants policies (no recursion)';
  RAISE NOTICE '  3. ✅ Updated chats policies (uses function for consistency)';
  RAISE NOTICE '  4. ✅ Updated messages policies (uses function for consistency)';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'The SECURITY DEFINER function bypasses RLS to check';
  RAISE NOTICE 'membership without triggering recursive policy checks.';
  RAISE NOTICE 'All chat-related policies now use this function consistently.';
  RAISE NOTICE '================================================';
END $$;

COMMIT;
