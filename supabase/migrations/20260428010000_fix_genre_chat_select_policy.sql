-- Genre chats never populate the chats.users array (that's only for DMs/group chats).
-- The existing SELECT policy `auth.uid() = ANY(users)` blocks ALL genre chat reads,
-- so joinGenre() can't find or create them → returns null → "Could not join chat" error.
-- Fix: allow authenticated users to see genre chats (they are public community rooms).

DROP POLICY IF EXISTS "chats_select_policy" ON public.chats;

CREATE POLICY "chats_select_policy" ON public.chats
  FOR SELECT
  USING (
    public.is_user_chat_participant(chats.id, auth.uid())
    OR entity_type = 'genre'
  );
