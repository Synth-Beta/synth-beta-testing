-- ============================================================
-- Fix Infinite Recursion in chat_participants RLS Policies
-- ============================================================
-- The issue: Policies checking chats.users can cause recursion
-- Solution: Use direct user_id check OR check chats.users without
-- triggering chat_participants queries

-- Drop existing problematic policies
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;

-- Create non-recursive RLS policies
-- SELECT: Users can see participants if:
-- 1. They are the participant themselves (user_id = auth.uid())
-- 2. OR they are in the chat's users array (direct check, no recursion)
CREATE POLICY "chat_participants_select" ON public.chat_participants
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

-- INSERT: Users can add participants if:
-- 1. They are adding themselves (user_id = auth.uid())
-- 2. OR they are in the chat's users array (to add others)
CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

-- UPDATE: Users can update if:
-- 1. They are updating their own participation (user_id = auth.uid())
-- 2. OR they are in the chat's users array (for admin actions)
CREATE POLICY "chat_participants_update" ON public.chat_participants
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

-- DELETE: Users can delete if:
-- 1. They are removing their own participation (user_id = auth.uid())
-- 2. OR they are in the chat's users array (for admin actions)
CREATE POLICY "chat_participants_delete" ON public.chat_participants
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

