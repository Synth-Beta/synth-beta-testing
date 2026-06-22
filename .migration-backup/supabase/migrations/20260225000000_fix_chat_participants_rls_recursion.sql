-- Fix infinite recursion (error 42P17) in chat_participants RLS policies.
--
-- Root cause: the SELECT, INSERT, UPDATE, and DELETE policies on chat_participants
-- all contain self-referential EXISTS subqueries, e.g.:
--
--   EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = ...)
--
-- When Postgres evaluates RLS on a row in chat_participants, it fires the policy,
-- which queries chat_participants again, which fires the policy again → infinite loop.
--
-- Fix: replace the self-referential subqueries with SECURITY DEFINER helper functions.
-- SECURITY DEFINER functions run as the function owner (postgres), bypassing RLS,
-- which breaks the recursion cycle while preserving the same access logic.

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================

-- Returns all chat_ids the current user is a participant in.
-- Used by the SELECT policy to allow viewing all participants in shared chats.
CREATE OR REPLACE FUNCTION public.get_my_chat_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT chat_id
  FROM public.chat_participants
  WHERE user_id = auth.uid();
$$;

-- Returns true if the current user is an admin of a specific chat.
-- Used by INSERT/UPDATE/DELETE policies to allow admins to manage other participants.
CREATE OR REPLACE FUNCTION public.is_chat_admin(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_participants
    WHERE chat_id = p_chat_id
      AND user_id = auth.uid()
      AND is_admin = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_chat_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_admin(uuid) TO authenticated;

-- ============================================================
-- REBUILD ALL FOUR chat_participants POLICIES (non-recursive)
-- ============================================================

DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;

-- SELECT: see your own row, or see any participant in a chat you're in.
CREATE POLICY "chat_participants_select" ON public.chat_participants
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR chat_id IN (SELECT public.get_my_chat_ids())
  );

-- INSERT: add yourself, or an admin can add others.
CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_chat_admin(chat_id)
  );

-- UPDATE: update your own row, or an admin can update others.
CREATE POLICY "chat_participants_update" ON public.chat_participants
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_chat_admin(chat_id)
  );

-- DELETE: remove yourself, or an admin can remove others.
CREATE POLICY "chat_participants_delete" ON public.chat_participants
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_chat_admin(chat_id)
  );
