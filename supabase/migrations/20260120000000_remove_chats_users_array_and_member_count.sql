-- ============================================================
-- Remove chats.users Array and chats.member_count Column
-- ============================================================
-- This migration fixes normalization and integrity issues:
-- 1. Removes chats.users array column (redundant with chat_participants)
-- 2. Removes chats.member_count column (can be computed via COUNT on chat_participants)
-- 3. Ensures unique constraint on chat_participants(chat_id, user_id)
-- 4. Drops triggers/functions that maintained the denormalized data
-- 5. Updates functions/views that referenced these columns
--
-- Rationale:
-- - Two representations of the same relationship (array + join table) create integrity anomalies
-- - chat_participants is the single source of truth (3NF compliant)
-- - member_count can be computed on-demand or via a materialized view if needed

BEGIN;

-- ============================================================
-- STEP 1: Ensure unique constraint exists on chat_participants
-- ============================================================

-- Check if unique constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'chat_participants_chat_id_user_id_key'
    AND conrelid = 'public.chat_participants'::regclass
  ) THEN
    -- Add unique constraint if it doesn't exist
    ALTER TABLE public.chat_participants
    ADD CONSTRAINT chat_participants_chat_id_user_id_key 
    UNIQUE (chat_id, user_id);
    
    RAISE NOTICE '✅ Added unique constraint on chat_participants(chat_id, user_id)';
  ELSE
    RAISE NOTICE '✅ Unique constraint already exists on chat_participants(chat_id, user_id)';
  END IF;
END $$;

-- ============================================================
-- STEP 2: Drop triggers that maintain denormalized data
-- ============================================================

-- Drop trigger that syncs chat_participants → chats.users
DROP TRIGGER IF EXISTS trg_sync_chat_users_from_participants ON public.chat_participants;

-- Drop trigger that updates member_count
DROP TRIGGER IF EXISTS trg_update_chat_member_count ON public.chat_participants;

-- Drop the functions (they're no longer needed)
DROP FUNCTION IF EXISTS public.sync_chat_users_from_participants() CASCADE;
DROP FUNCTION IF EXISTS public.update_chat_member_count() CASCADE;

-- ============================================================
-- STEP 3: Update functions that reference chats.users or chats.member_count
-- ============================================================

-- Update get_user_chats function to compute member_count on the fly
-- Drop first because we're changing the return type (removing users array column)
DROP FUNCTION IF EXISTS public.get_user_chats(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_user_chats(user_id UUID)
RETURNS TABLE (
    id UUID,
    chat_name TEXT,
    is_group_chat BOOLEAN,
    latest_message_id UUID,
    latest_message TEXT,
    latest_message_created_at TIMESTAMPTZ,
    latest_message_sender_name TEXT,
    group_admin_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    member_count INTEGER
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
        c.latest_message_id,
        COALESCE(m.content, '') as latest_message,
        m.created_at as latest_message_created_at,
        COALESCE(u.name, '') as latest_message_sender_name,
        c.group_admin_id,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*)::integer 
         FROM public.chat_participants cp 
         WHERE cp.chat_id = c.id) as member_count  -- Compute on the fly
    FROM public.chats c
    -- Join with chat_participants to find user's chats (3NF compliant)
    INNER JOIN public.chat_participants cp ON cp.chat_id = c.id AND cp.user_id = user_id
    LEFT JOIN public.messages m ON c.latest_message_id = m.id
    LEFT JOIN public.users u ON m.sender_id = u.user_id
    ORDER BY c.updated_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_user_chats(UUID) IS 
'Returns user''s chats with latest message info. member_count is computed from chat_participants (3NF compliant).';

-- ============================================================
-- STEP 4: Update verified chat functions
-- ============================================================

-- Update get_verified_chat_info to compute member_count from chat_participants
CREATE OR REPLACE FUNCTION public.get_verified_chat_info(
  p_entity_type TEXT,
  p_entity_id TEXT
)
RETURNS TABLE (
  chat_id UUID,
  chat_name TEXT,
  member_count INTEGER,
  last_activity_at TIMESTAMPTZ,
  is_user_member BOOLEAN,
  current_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  -- Return chat info if exists (check both entity_id and entity_uuid)
  RETURN QUERY
  SELECT 
    c.id AS chat_id,
    c.chat_name,
    (SELECT COUNT(*)::integer 
     FROM public.chat_participants cp 
     WHERE cp.chat_id = c.id) AS member_count,  -- Compute from chat_participants
    c.last_activity_at,
    (v_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.chat_participants cp 
      WHERE cp.chat_id = c.id AND cp.user_id = v_user_id
    )) AS is_user_member,
    v_user_id AS current_user_id
  FROM public.chats c
  WHERE c.entity_type = p_entity_type
    AND (c.entity_id = p_entity_id OR c.entity_uuid::TEXT = p_entity_id)
    AND c.is_verified = true
  LIMIT 1;

  -- If no chat found, return NULL values
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      NULL::UUID AS chat_id,
      NULL::TEXT AS chat_name,
      NULL::INTEGER AS member_count,
      NULL::TIMESTAMPTZ AS last_activity_at,
      false AS is_user_member,
      v_user_id AS current_user_id;
  END IF;
END;
$$;

-- Update add_user_to_verified_chat to use chat_participants only
-- Simplified: ON CONFLICT DO NOTHING handles duplicates, no need for SELECT check
CREATE OR REPLACE FUNCTION public.add_user_to_verified_chat(
  p_chat_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Add user via chat_participants (the source of truth)
  -- ON CONFLICT DO NOTHING handles race conditions and existing members
  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES (p_chat_id, p_user_id, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  -- Update chat's updated_at timestamp
  UPDATE public.chats
  SET updated_at = NOW()
  WHERE id = p_chat_id;

  RETURN p_chat_id;
END;
$$;

-- ============================================================
-- STEP 5: Update RLS policies that referenced chats.users
-- ============================================================

-- Update chat_participants RLS policies to check via chat_participants table
DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;

-- SELECT: Users can see participants if they are the participant OR if they are in the chat (via chat_participants)
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

-- INSERT: Users can only add themselves (security: prevents random members from adding others)
-- For invites/additions by other members, use add_user_to_verified_chat() function instead
CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can update their own participation OR if they are in the chat (via chat_participants)
CREATE POLICY "chat_participants_update" ON public.chat_participants
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_participants.chat_id
      AND cp.user_id = auth.uid()
    )
  );

-- DELETE: Users can remove their own participation OR if they are in the chat (via chat_participants)
CREATE POLICY "chat_participants_delete" ON public.chat_participants
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_participants.chat_id
      AND cp.user_id = auth.uid()
    )
  );

-- Update chats RLS policies to check via chat_participants
-- First, let's check if there are existing policies that reference chats.users
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'chats'
    AND (qual LIKE '%users%' OR with_check LIKE '%users%')
  LOOP
    RAISE NOTICE 'Found policy % that references users array - may need manual review', pol.policyname;
  END LOOP;
END $$;

-- ============================================================
-- STEP 6: Update RLS policies on chats and messages tables
-- ============================================================
-- These policies currently reference chats.users - update them to use chat_participants

-- Drop and recreate chats table policies to use chat_participants
-- First, dynamically drop ALL policies on chats to ensure we get them all
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'chats'
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.chats CASCADE', pol.policyname);
      RAISE NOTICE 'Dropped chats policy: %', pol.policyname;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop policy %: %', pol.policyname, SQLERRM;
    END;
  END LOOP;
  
  -- Also drop known policy names explicitly
  DROP POLICY IF EXISTS "chats_select_policy" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "chats_insert_policy" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "chats_update_policy" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "chats_delete_policy" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Users can view chats they participate in" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Users can create chats" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Users can update chats they participate in" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Authenticated users can view their chats" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Authenticated users can update their chats" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Authenticated users can delete their chats" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Users can view chats using users array" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Users can create chats using users array" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Users can update chats using users array" ON public.chats CASCADE;
  DROP POLICY IF EXISTS "Users can delete chats using users array" ON public.chats CASCADE;
END $$;

-- SELECT: Users can view chats where they are participants (via chat_participants)
CREATE POLICY "chats_select_policy" ON public.chats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chats.id
      AND cp.user_id = auth.uid()
    )
  );

-- INSERT: Allow users to create chats (security handled by RPC functions)
CREATE POLICY "chats_insert_policy" ON public.chats
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: Users can update chats where they are participants (via chat_participants)
CREATE POLICY "chats_update_policy" ON public.chats
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chats.id
      AND cp.user_id = auth.uid()
    )
  );

-- DELETE: Users can delete chats where they are participants (via chat_participants)
CREATE POLICY "chats_delete_policy" ON public.chats
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chats.id
      AND cp.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "chats_select_policy" ON public.chats IS 
'Users can view chats where they are participants (3NF compliant, uses chat_participants)';

COMMENT ON POLICY "chats_update_policy" ON public.chats IS 
'Users can update chats where they are participants (3NF compliant, uses chat_participants)';

COMMENT ON POLICY "chats_delete_policy" ON public.chats IS 
'Users can delete chats where they are participants (3NF compliant, uses chat_participants)';

-- Drop and recreate messages table policies to use chat_participants
-- First, dynamically find and drop ALL policies that reference chats.users column
DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Drop all policies on messages that might reference chats.users
  FOR pol IN 
    SELECT policyname
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'messages'
  LOOP
    -- Check if policy references chats.users in any way
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages CASCADE', pol.policyname);
      RAISE NOTICE 'Dropped messages policy: %', pol.policyname;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop policy %: %', pol.policyname, SQLERRM;
    END;
  END LOOP;
  
  -- Also drop known policy names explicitly
  DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages CASCADE;
  DROP POLICY IF EXISTS "Users can send messages in their chats" ON public.messages CASCADE;
  DROP POLICY IF EXISTS "Users can send messages to their chats" ON public.messages CASCADE;
  DROP POLICY IF EXISTS "messages_select_policy" ON public.messages CASCADE;
  DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages CASCADE;
  DROP POLICY IF EXISTS "messages_update_policy" ON public.messages CASCADE;
  DROP POLICY IF EXISTS "messages_delete_policy" ON public.messages CASCADE;
END $$;

-- SELECT: Users can view messages in chats where they are participants (via chat_participants)
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = messages.chat_id
      AND cp.user_id = auth.uid()
    )
  );

-- INSERT: Users can send messages in chats where they are participants (via chat_participants)
CREATE POLICY "messages_insert_policy" ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = messages.chat_id
      AND cp.user_id = auth.uid()
    )
  );

-- UPDATE: Users can update their own messages
CREATE POLICY "messages_update_policy" ON public.messages
  FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- DELETE: Users can delete their own messages
CREATE POLICY "messages_delete_policy" ON public.messages
  FOR DELETE
  USING (sender_id = auth.uid());

COMMENT ON POLICY "messages_select_policy" ON public.messages IS 
'Users can view messages in chats where they are participants (3NF compliant, uses chat_participants)';

COMMENT ON POLICY "messages_insert_policy" ON public.messages IS 
'Users can send messages in chats where they are participants (3NF compliant, uses chat_participants)';

-- ============================================================
-- STEP 7: Drop indexes on chats.users array (no longer needed)
-- ============================================================

DROP INDEX IF EXISTS idx_chats_users;

-- Note: The unique constraint on chat_participants(chat_id, user_id) creates an index
-- that starts with chat_id, making COUNT(*) queries on chat_id fast. No additional index needed.

-- ============================================================
-- STEP 8: Remove columns (after all dependencies are updated)
-- ============================================================

-- Remove member_count column
ALTER TABLE public.chats 
DROP COLUMN IF EXISTS member_count;

-- Remove users array column
ALTER TABLE public.chats 
DROP COLUMN IF EXISTS users;

-- ============================================================
-- STEP 9: Update TypeScript types (documentation only)
-- ============================================================

COMMENT ON TABLE public.chats IS 
'Chats table. Use chat_participants table (not chats.users array) as the source of truth for membership. member_count should be computed via COUNT(*) on chat_participants.';

COMMENT ON TABLE public.chat_participants IS 
'Chat participants join table. This is the single source of truth (3NF compliant) for chat membership. Use this table instead of chats.users array.';

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Chat schema normalization complete:';
  RAISE NOTICE '  1. ✅ Removed chats.users array column';
  RAISE NOTICE '  2. ✅ Removed chats.member_count column';
  RAISE NOTICE '  3. ✅ Ensured unique constraint on chat_participants(chat_id, user_id)';
  RAISE NOTICE '  4. ✅ Dropped denormalization triggers/functions';
  RAISE NOTICE '  5. ✅ Updated functions to use chat_participants';
  RAISE NOTICE '  6. ✅ Updated RLS policies';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Note: Application code must be updated to:';
  RAISE NOTICE '  - Query chat_participants instead of chats.users';
  RAISE NOTICE '  - Compute member_count via COUNT(*) on chat_participants';
  RAISE NOTICE '  - Update TypeScript types to remove users and member_count from Chat interface';
  RAISE NOTICE '================================================';
END $$;

COMMIT;

