-- ============================================================
-- Fix Foreign Key Constraint Names for PostgREST Compatibility
-- ============================================================
-- PostgREST expects foreign key constraints to follow the pattern:
-- {table}_{column}_fkey
-- 
-- This migration renames constraints to match PostgREST's expectations
-- so that relationship hints in queries work correctly.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Rename messages.sender_id foreign key constraint
-- ============================================================
-- Current: fk_messages_sender_id
-- Expected: messages_sender_id_fkey

DO $$
BEGIN
  -- Check if the old constraint exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'messages'
      AND constraint_name = 'fk_messages_sender_id'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    -- Rename the constraint
    ALTER TABLE public.messages
    RENAME CONSTRAINT fk_messages_sender_id TO messages_sender_id_fkey;
    
    RAISE NOTICE '✅ Renamed fk_messages_sender_id to messages_sender_id_fkey';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'messages'
      AND constraint_name = 'messages_sender_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    RAISE NOTICE '✅ Constraint messages_sender_id_fkey already exists with correct name';
  ELSE
    RAISE NOTICE '⚠️  No foreign key constraint found for messages.sender_id';
  END IF;
END $$;

-- ============================================================
-- STEP 2: Rename messages.chat_id foreign key constraint (if needed)
-- ============================================================
-- Current: fk_messages_chat_id
-- Expected: messages_chat_id_fkey

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'messages'
      AND constraint_name = 'fk_messages_chat_id'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.messages
    RENAME CONSTRAINT fk_messages_chat_id TO messages_chat_id_fkey;
    
    RAISE NOTICE '✅ Renamed fk_messages_chat_id to messages_chat_id_fkey';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'messages'
      AND constraint_name = 'messages_chat_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    RAISE NOTICE '✅ Constraint messages_chat_id_fkey already exists with correct name';
  END IF;
END $$;

-- ============================================================
-- STEP 3: Rename messages.shared_event_id foreign key constraint (if needed)
-- ============================================================
-- Current: fk_messages_shared_event_id
-- Expected: messages_shared_event_id_fkey

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'messages'
      AND constraint_name = 'fk_messages_shared_event_id'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.messages
    RENAME CONSTRAINT fk_messages_shared_event_id TO messages_shared_event_id_fkey;
    
    RAISE NOTICE '✅ Renamed fk_messages_shared_event_id to messages_shared_event_id_fkey';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'messages'
      AND constraint_name = 'messages_shared_event_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    RAISE NOTICE '✅ Constraint messages_shared_event_id_fkey already exists with correct name';
  END IF;
END $$;

-- ============================================================
-- STEP 4: Rename chats.latest_message_id foreign key constraint (if needed)
-- ============================================================
-- Current: fk_chats_latest_message_id
-- Expected: chats_latest_message_id_fkey

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'chats'
      AND constraint_name = 'fk_chats_latest_message_id'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.chats
    RENAME CONSTRAINT fk_chats_latest_message_id TO chats_latest_message_id_fkey;
    
    RAISE NOTICE '✅ Renamed fk_chats_latest_message_id to chats_latest_message_id_fkey';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'chats'
      AND constraint_name = 'chats_latest_message_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    RAISE NOTICE '✅ Constraint chats_latest_message_id_fkey already exists with correct name';
  END IF;
END $$;

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
DECLARE
  constraint_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.table_constraints
  WHERE constraint_schema = 'public'
    AND table_name IN ('messages', 'chats')
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%_fkey';
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Foreign key constraint renaming complete:';
  RAISE NOTICE '  Found % foreign key constraints with _fkey suffix', constraint_count;
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PostgREST should now be able to resolve relationships';
  RAISE NOTICE 'using the standard {table}_{column}_fkey naming pattern.';
  RAISE NOTICE '================================================';
END $$;

COMMIT;
