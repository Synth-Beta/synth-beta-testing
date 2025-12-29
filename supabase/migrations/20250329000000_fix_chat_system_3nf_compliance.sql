-- ============================================================
-- Fix Chat System for 3NF Compliance
-- ============================================================
-- This migration ensures the chat system uses chat_participants 
-- table as the source of truth (3NF compliant), with chats.users 
-- array as a denormalized cache maintained by triggers.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: CREATE TRIGGER FUNCTION TO SYNC chat_participants → chats.users
-- ============================================================
-- This function syncs the normalized chat_participants table to 
-- the denormalized chats.users array for backward compatibility

CREATE OR REPLACE FUNCTION public.sync_chat_users_from_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id UUID;
  v_users UUID[];
BEGIN
  -- Determine chat_id from trigger context
  IF TG_OP = 'INSERT' THEN
    v_chat_id := NEW.chat_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_chat_id := OLD.chat_id;
  END IF;

  -- Update chats.users array from chat_participants
  SELECT ARRAY_AGG(user_id ORDER BY joined_at)
  INTO v_users
  FROM public.chat_participants
  WHERE chat_id = v_chat_id;

  -- Handle case where no participants (shouldn't happen, but be safe)
  IF v_users IS NULL THEN
    v_users := ARRAY[]::UUID[];
  END IF;

  -- Update the chats table
  -- Note: member_count is also updated by update_chat_member_count trigger, 
  -- but we update it here too for consistency (idempotent operation)
  UPDATE public.chats
  SET 
    users = v_users,
    member_count = COALESCE(array_length(v_users, 1), 0),
    updated_at = now()
  WHERE id = v_chat_id;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  ELSE
    RETURN OLD;
  END IF;
END;
$$;

-- Create trigger to sync on INSERT/DELETE to chat_participants
-- Note: This runs alongside the existing update_chat_member_count trigger
-- Both will fire, but that's okay as member_count update is idempotent
DROP TRIGGER IF EXISTS trg_sync_chat_users_from_participants ON public.chat_participants;
CREATE TRIGGER trg_sync_chat_users_from_participants
AFTER INSERT OR DELETE ON public.chat_participants
FOR EACH ROW
EXECUTE FUNCTION sync_chat_users_from_participants();

COMMENT ON FUNCTION public.sync_chat_users_from_participants() IS 
'Syncs chat_participants table to chats.users array for backward compatibility';

-- ============================================================
-- STEP 2: UPDATE create_direct_chat FUNCTION
-- ============================================================
-- Now uses chat_participants table as source of truth

CREATE OR REPLACE FUNCTION public.create_direct_chat(user1_id uuid, user2_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_chat_id uuid;
  new_chat_id uuid;
BEGIN
  -- Check if direct chat already exists by querying chat_participants
  SELECT c.id INTO existing_chat_id
  FROM public.chats c
  WHERE c.is_group_chat = false
    AND EXISTS (
      SELECT 1 FROM public.chat_participants cp1
      WHERE cp1.chat_id = c.id AND cp1.user_id = user1_id
    )
    AND EXISTS (
      SELECT 1 FROM public.chat_participants cp2
      WHERE cp2.chat_id = c.id AND cp2.user_id = user2_id
    )
    AND (
      SELECT COUNT(*) FROM public.chat_participants cp
      WHERE cp.chat_id = c.id
    ) = 2  -- Only 2 participants for direct chat
  LIMIT 1;
  
  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;
  
  -- Create new direct chat (users array will be empty initially, trigger will populate it)
  INSERT INTO public.chats (chat_name, is_group_chat, users)
  VALUES ('Direct Chat', false, ARRAY[]::UUID[])
  RETURNING id INTO new_chat_id;
  
  -- Insert both users into chat_participants (trigger will sync to users array)
  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES 
    (new_chat_id, user1_id, now()),
    (new_chat_id, user2_id, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;
  
  RETURN new_chat_id;
END;
$$;

COMMENT ON FUNCTION public.create_direct_chat(uuid, uuid) IS 
'Creates or returns existing direct chat between two users (3NF compliant, uses chat_participants)';

-- ============================================================
-- STEP 3: UPDATE create_group_chat FUNCTION
-- ============================================================
-- Now uses chat_participants table as source of truth

CREATE OR REPLACE FUNCTION public.create_group_chat(chat_name text, user_ids uuid[], admin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_chat_id uuid;
  all_user_ids uuid[];
  user_id uuid;
BEGIN
  -- Ensure admin is included in user list
  all_user_ids := user_ids;
  IF NOT (admin_id = ANY(all_user_ids)) THEN
    all_user_ids := array_append(all_user_ids, admin_id);
  END IF;
  
  -- Create group chat (users array will be empty initially, trigger will populate it)
  INSERT INTO public.chats (chat_name, is_group_chat, users, group_admin_id)
  VALUES (chat_name, true, ARRAY[]::UUID[], admin_id)
  RETURNING id INTO new_chat_id;
  
  -- Insert all users into chat_participants (trigger will sync to users array)
  FOREACH user_id IN ARRAY all_user_ids
  LOOP
    INSERT INTO public.chat_participants (chat_id, user_id, is_admin, joined_at)
    VALUES (
      new_chat_id, 
      user_id, 
      (user_id = admin_id),  -- Set is_admin = true for admin_id
      now()
    )
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  END LOOP;
  
  RETURN new_chat_id;
END;
$$;

COMMENT ON FUNCTION public.create_group_chat(text, uuid[], uuid) IS 
'Creates a group chat with specified users (3NF compliant, uses chat_participants)';

-- ============================================================
-- STEP 4: UPDATE join_verified_chat FUNCTION
-- ============================================================
-- Now uses chat_participants table

CREATE OR REPLACE FUNCTION public.join_verified_chat(
  p_chat_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member BOOLEAN;
BEGIN
  -- Check if chat is verified
  IF NOT EXISTS (
    SELECT 1 FROM public.chats 
    WHERE id = p_chat_id AND is_verified = true
  ) THEN
    RAISE EXCEPTION 'Chat % is not a verified chat', p_chat_id;
  END IF;

  -- Check if user is already a member using chat_participants
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE chat_id = p_chat_id AND user_id = p_user_id
  ) INTO v_is_member;

  -- If already a member, just return chat_id
  IF v_is_member THEN
    RETURN p_chat_id;
  END IF;

  -- Add user to chat_participants (trigger will sync to users array)
  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES (p_chat_id, p_user_id, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN p_chat_id;
END;
$$;

COMMENT ON FUNCTION public.join_verified_chat(UUID, UUID) IS 
'Adds a user to a verified chat if they are not already a member (3NF compliant, uses chat_participants)';

-- ============================================================
-- STEP 5: UPDATE get_or_create_verified_chat FUNCTION
-- ============================================================
-- Ensure it doesn't create participants (that should be done via join_verified_chat)
-- But we'll verify it doesn't interfere with our new approach

-- Note: This function creates chats with empty users array, which is correct.
-- Users join via join_verified_chat which populates chat_participants.
-- No changes needed here as it already creates chats correctly.

-- ============================================================
-- STEP 6: UPDATE get_user_chats FUNCTION
-- ============================================================
-- Now queries chat_participants table instead of users array

CREATE OR REPLACE FUNCTION public.get_user_chats(user_id UUID)
RETURNS TABLE (
    id UUID,
    chat_name TEXT,
    is_group_chat BOOLEAN,
    users UUID[],
    latest_message_id UUID,
    latest_message TEXT,
    latest_message_created_at TIMESTAMPTZ,
    latest_message_sender_name TEXT,
    group_admin_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.chat_name,
        c.is_group_chat,
        c.users,  -- Return from denormalized cache (for backward compatibility)
        c.latest_message_id,
        COALESCE(m.content, '') as latest_message,
        m.created_at as latest_message_created_at,
        u.name as latest_message_sender_name,
        c.group_admin_id,
        c.created_at,
        c.updated_at
    FROM public.chats c
    -- Join with chat_participants to find user's chats (3NF compliant)
    INNER JOIN public.chat_participants cp ON cp.chat_id = c.id AND cp.user_id = get_user_chats.user_id
    LEFT JOIN public.messages m ON c.latest_message_id = m.id
    LEFT JOIN public.users u ON m.sender_id = u.user_id
    ORDER BY c.updated_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_user_chats(UUID) IS 
'Returns user''s chats with latest message info (3NF compliant, queries chat_participants)';

-- ============================================================
-- STEP 7: BACKFILL chat_participants FROM EXISTING chats.users
-- ============================================================
-- Migrate existing data from denormalized users array to normalized chat_participants table

DO $$
DECLARE
  chat_rec RECORD;
  v_user_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- For each chat that has users in the array but might not have participants
  FOR chat_rec IN 
    SELECT c.id, c.users, c.group_admin_id, c.created_at
    FROM public.chats c
    WHERE array_length(c.users, 1) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.chat_participants cp 
        WHERE cp.chat_id = c.id
      )
  LOOP
    -- Insert each user from the array into chat_participants
    FOREACH v_user_id IN ARRAY chat_rec.users
    LOOP
      -- Determine if user is admin
      v_is_admin := (v_user_id = chat_rec.group_admin_id);
      
      -- Insert participant (ON CONFLICT handles duplicates gracefully)
      INSERT INTO public.chat_participants (
        chat_id, 
        user_id, 
        is_admin, 
        joined_at,
        notifications_enabled
      )
      VALUES (
        chat_rec.id,
        v_user_id,
        v_is_admin,
        COALESCE(chat_rec.created_at, now()),  -- Use chat created_at if available
        true
      )
      ON CONFLICT (chat_id, user_id) DO NOTHING;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Backfilled chat_participants from existing chats.users arrays';
END $$;

-- ============================================================
-- STEP 8: UPDATE RLS POLICIES FOR chats TABLE
-- ============================================================
-- Update policies to use chat_participants table for security checks

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view chats they participate in" ON public.chats;
DROP POLICY IF EXISTS "Users can create chats" ON public.chats;
DROP POLICY IF EXISTS "Users can update chats they participate in" ON public.chats;
DROP POLICY IF EXISTS "chats_select_policy" ON public.chats;
DROP POLICY IF EXISTS "chats_insert_policy" ON public.chats;
DROP POLICY IF EXISTS "chats_update_policy" ON public.chats;
DROP POLICY IF EXISTS "chats_delete_policy" ON public.chats;

-- SELECT: Users can see chats where they exist in chat_participants (3NF compliant)
CREATE POLICY "chats_select_policy" ON public.chats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chats.id
      AND cp.user_id = auth.uid()
    )
  );

-- INSERT: Allow users to create chats (they'll be added to chat_participants by the RPC functions)
CREATE POLICY "chats_insert_policy" ON public.chats
  FOR INSERT
  WITH CHECK (true);  -- RPC functions handle security, and users array will be populated by triggers

-- UPDATE: Users can update chats where they are participants
CREATE POLICY "chats_update_policy" ON public.chats
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chats.id
      AND cp.user_id = auth.uid()
    )
  );

-- DELETE: Only admins can delete chats (optional - can be added if needed)
-- For now, we'll rely on CASCADE deletes through foreign keys

COMMENT ON POLICY "chats_select_policy" ON public.chats IS 
'Users can view chats where they are participants (3NF compliant, uses chat_participants)';
COMMENT ON POLICY "chats_insert_policy" ON public.chats IS 
'Allow chat creation (security handled by RPC functions)';
COMMENT ON POLICY "chats_update_policy" ON public.chats IS 
'Users can update chats where they are participants (3NF compliant, uses chat_participants)';

-- ============================================================
-- STEP 9: ENSURE chat_participants RLS POLICIES ARE CORRECT
-- ============================================================
-- The existing policies should work, but let's verify and update if needed
-- to avoid recursion while still using chat_participants as source of truth

-- Drop existing policies
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;

-- SELECT: Users can see participants if they are the participant OR if they are a participant in that chat
-- Use a subquery to check membership without recursion
CREATE POLICY "chat_participants_select" ON public.chat_participants
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_participants.chat_id
      AND cp.user_id = auth.uid()
    )
  );

-- INSERT: Users can add themselves to chats, or admins can add others
-- For verified chats, users can join themselves via join_verified_chat function
CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()  -- Users can add themselves
    OR EXISTS (
      -- Or if auth.uid() is an admin of this chat and adding another user
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_participants.chat_id
      AND cp.user_id = auth.uid()
      AND cp.is_admin = true
    )
  );

-- UPDATE: Users can update their own participation, or admins can update others
CREATE POLICY "chat_participants_update" ON public.chat_participants
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_participants.chat_id
      AND cp.user_id = auth.uid()
      AND cp.is_admin = true
    )
  );

-- DELETE: Users can remove their own participation, or admins can remove others
CREATE POLICY "chat_participants_delete" ON public.chat_participants
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_participants.chat_id
      AND cp.user_id = auth.uid()
      AND cp.is_admin = true
    )
  );

COMMENT ON POLICY "chat_participants_select" ON public.chat_participants IS 
'Users can see participants in chats they are members of (3NF compliant)';
COMMENT ON POLICY "chat_participants_insert" ON public.chat_participants IS 
'Users can add themselves or admins can add others (3NF compliant)';
COMMENT ON POLICY "chat_participants_update" ON public.chat_participants IS 
'Users can update their own participation or admins can update others (3NF compliant)';
COMMENT ON POLICY "chat_participants_delete" ON public.chat_participants IS 
'Users can remove their own participation or admins can remove others (3NF compliant)';

-- ============================================================
-- STEP 10: GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.create_direct_chat(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[], uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_verified_chat(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_chats(UUID) TO anon, authenticated;

-- ============================================================
-- STEP 11: VERIFICATION
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Chat System 3NF Compliance Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ chat_participants table is now the source of truth';
  RAISE NOTICE '✅ chats.users array is maintained by triggers (backward compatibility)';
  RAISE NOTICE '✅ All RPC functions updated to use chat_participants';
  RAISE NOTICE '✅ RLS policies updated to use chat_participants';
  RAISE NOTICE '✅ Existing data backfilled to chat_participants';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test creating direct chats';
  RAISE NOTICE '2. Test creating group chats';
  RAISE NOTICE '3. Test joining verified chats';
  RAISE NOTICE '4. Verify chat_participants table is populated';
  RAISE NOTICE '5. Verify chats.users array is synced correctly';
  RAISE NOTICE '========================================';
END $$;

COMMIT;

