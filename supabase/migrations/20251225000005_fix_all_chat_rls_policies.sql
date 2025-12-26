-- ============================================================
-- Fix All Chat RLS Policies to Avoid Infinite Recursion
-- ============================================================
-- The issue: If chats policy checks chat_participants, and chat_participants
-- policy checks chats, we get infinite recursion.
-- Solution: All policies should check chats.users array directly,
-- never query chat_participants table in RLS policies.

-- ============================================================
-- STEP 1: FIX chats TABLE POLICIES
-- ============================================================

-- Drop all existing chats policies
DROP POLICY IF EXISTS "Users can view chats they participate in" ON public.chats;
DROP POLICY IF EXISTS "Users can create chats" ON public.chats;
DROP POLICY IF EXISTS "Users can update chats they participate in" ON public.chats;
DROP POLICY IF EXISTS "Users can view chats they're part of" ON public.chats;
DROP POLICY IF EXISTS "chats_select_policy" ON public.chats;
DROP POLICY IF EXISTS "chats_insert_policy" ON public.chats;
DROP POLICY IF EXISTS "chats_update_policy" ON public.chats;
DROP POLICY IF EXISTS "chats_delete_policy" ON public.chats;
DROP POLICY IF EXISTS "Authenticated users can view their chats" ON public.chats;
DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats;
DROP POLICY IF EXISTS "Authenticated users can update their chats" ON public.chats;
DROP POLICY IF EXISTS "Authenticated users can delete their chats" ON public.chats;
DROP POLICY IF EXISTS "Users can view chats using users array" ON public.chats;
DROP POLICY IF EXISTS "Users can create chats using users array" ON public.chats;
DROP POLICY IF EXISTS "Users can update chats using users array" ON public.chats;
DROP POLICY IF EXISTS "Users can delete chats using users array" ON public.chats;

-- Create simple, non-recursive policies for chats
-- These only check the users array, never query chat_participants
CREATE POLICY "chats_select_policy" ON public.chats
  FOR SELECT
  USING (auth.uid() = ANY(users));

CREATE POLICY "chats_insert_policy" ON public.chats
  FOR INSERT
  WITH CHECK (auth.uid() = ANY(users));

CREATE POLICY "chats_update_policy" ON public.chats
  FOR UPDATE
  USING (auth.uid() = ANY(users));

CREATE POLICY "chats_delete_policy" ON public.chats
  FOR DELETE
  USING (auth.uid() = ANY(users));

-- ============================================================
-- STEP 2: FIX chat_participants TABLE POLICIES
-- ============================================================

-- Drop all existing chat_participants policies
DROP POLICY IF EXISTS "Users can view participants in their chats" ON public.chat_participants;
DROP POLICY IF EXISTS "Users can add participants to chats they're in" ON public.chat_participants;
DROP POLICY IF EXISTS "Users can update participants in their chats" ON public.chat_participants;
DROP POLICY IF EXISTS "Users can remove participants from their chats" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;

-- Create non-recursive policies for chat_participants
-- These check chats.users array directly, never query chat_participants
CREATE POLICY "chat_participants_select" ON public.chat_participants
  FOR SELECT
  USING (
    -- User can see their own participation
    user_id = auth.uid()
    OR
    -- User can see participants if they are in the chat's users array
    EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT
  WITH CHECK (
    -- User can add themselves
    user_id = auth.uid()
    OR
    -- User can add others if they are in the chat's users array
    EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

CREATE POLICY "chat_participants_update" ON public.chat_participants
  FOR UPDATE
  USING (
    -- User can update their own participation
    user_id = auth.uid()
    OR
    -- User can update if they are in the chat's users array (for admin actions)
    EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

CREATE POLICY "chat_participants_delete" ON public.chat_participants
  FOR DELETE
  USING (
    -- User can remove their own participation
    user_id = auth.uid()
    OR
    -- User can remove others if they are in the chat's users array (for admin actions)
    EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id
      AND auth.uid() = ANY(c.users)
    )
  );

