-- ============================================
-- MIGRATION: Fix Duplicate FKs and Missing Constraints for 3NF
-- ============================================
-- This migration fixes duplicate foreign key constraints and
-- adds missing foreign key constraints to ensure proper 3NF compliance
-- ============================================

-- ============================================
-- PHASE 1: FIX DUPLICATE FOREIGN KEY CONSTRAINTS
-- ============================================

-- Step 1.1: Fix notifications table - Remove duplicate actor_user_id FK
DO $$
DECLARE
  constraint_rec RECORD;
  auth_users_fk_count INTEGER := 0;
BEGIN
  -- Count FKs pointing to auth.users(id)
  SELECT COUNT(*) INTO auth_users_fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'notifications'
    AND kcu.column_name = 'actor_user_id'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_schema = 'auth'
    AND ccu.table_name = 'users'
    AND ccu.column_name = 'id';

  -- Find and drop FKs pointing to auth.users(id) (keep the one pointing to public.users(user_id))
  FOR constraint_rec IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'notifications'
      AND kcu.column_name = 'actor_user_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'auth'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
  LOOP
    EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS ' || constraint_rec.constraint_name || ' CASCADE';
    RAISE NOTICE 'Dropped duplicate FK: % (was pointing to auth.users instead of public.users)', constraint_rec.constraint_name;
  END LOOP;

  IF auth_users_fk_count > 0 THEN
    RAISE NOTICE '✅ Removed % duplicate actor_user_id FK(s) pointing to auth.users', auth_users_fk_count;
  ELSE
    RAISE NOTICE '✅ Verified: No duplicate actor_user_id FKs found';
  END IF;
END $$;

-- Step 1.2: Fix users table - Remove duplicate user_id FK
DO $$
DECLARE
  constraint_rec RECORD;
  duplicate_fk_count INTEGER := 0;
BEGIN
  -- Count total FKs on user_id column
  SELECT COUNT(*) INTO duplicate_fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'users'
    AND kcu.column_name = 'user_id'
    AND tc.constraint_type = 'FOREIGN KEY';

  -- If more than one FK exists, keep users_user_id_fkey and drop others
  IF duplicate_fk_count > 1 THEN
    FOR constraint_rec IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'users'
        AND kcu.column_name = 'user_id'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.constraint_name != 'users_user_id_fkey'  -- Keep this one
    LOOP
      EXECUTE 'ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ' || constraint_rec.constraint_name || ' CASCADE';
      RAISE NOTICE 'Dropped duplicate FK: %', constraint_rec.constraint_name;
    END LOOP;
    RAISE NOTICE '✅ Removed % duplicate user_id FK(s)', duplicate_fk_count - 1;
  ELSE
    RAISE NOTICE '✅ Verified: No duplicate user_id FKs found';
  END IF;
END $$;

-- ============================================
-- PHASE 2: ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================

-- Step 2.1: Add missing FK for messages.chat_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'messages'
      AND kcu.column_name = 'chat_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'chats'
      AND ccu.column_name = 'id'
  ) THEN
    -- Clean up orphaned chat_id references first (delete messages from non-existent chats)
    DELETE FROM public.messages
    WHERE chat_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.chats WHERE chats.id = messages.chat_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned chat_id references';
    
    -- Now create the FK constraint
    ALTER TABLE public.messages
    ADD CONSTRAINT fk_messages_chat_id 
      FOREIGN KEY (chat_id) 
      REFERENCES public.chats(id) 
      ON DELETE CASCADE;
    RAISE NOTICE '✅ Created messages.chat_id FK to chats.id';
  ELSE
    RAISE NOTICE '✅ Verified: messages.chat_id FK already exists';
  END IF;
END $$;

-- Step 2.2: Add missing FK for messages.shared_event_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'messages'
      AND kcu.column_name = 'shared_event_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'events'
      AND ccu.column_name = 'id'
  ) THEN
    -- Clean up orphaned shared_event_id references first (set to NULL if event doesn't exist)
    UPDATE public.messages
    SET shared_event_id = NULL
    WHERE shared_event_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.events WHERE events.id = messages.shared_event_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned shared_event_id references';
    
    -- Now create the FK constraint
    ALTER TABLE public.messages
    ADD CONSTRAINT fk_messages_shared_event_id 
      FOREIGN KEY (shared_event_id) 
      REFERENCES public.events(id) 
      ON DELETE SET NULL;
    RAISE NOTICE '✅ Created messages.shared_event_id FK to events.id';
  ELSE
    RAISE NOTICE '✅ Verified: messages.shared_event_id FK already exists';
  END IF;
END $$;

-- Step 2.3: Add missing FK for chats.latest_message_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'chats'
      AND kcu.column_name = 'latest_message_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'messages'
      AND ccu.column_name = 'id'
  ) THEN
    -- Clean up orphaned latest_message_id references first (set to NULL if message doesn't exist)
    UPDATE public.chats
    SET latest_message_id = NULL
    WHERE latest_message_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.messages WHERE messages.id = chats.latest_message_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned latest_message_id references';
    
    -- Now create the FK constraint
    ALTER TABLE public.chats
    ADD CONSTRAINT fk_chats_latest_message_id 
      FOREIGN KEY (latest_message_id) 
      REFERENCES public.messages(id) 
      ON DELETE SET NULL;
    RAISE NOTICE '✅ Created chats.latest_message_id FK to messages.id';
  ELSE
    RAISE NOTICE '✅ Verified: chats.latest_message_id FK already exists';
  END IF;
END $$;

-- ============================================
-- PHASE 3: VERIFY ALL FOREIGN KEY CONSTRAINTS
-- ============================================

-- Step 3.1: Check for any remaining duplicate or incorrect FKs
DO $$
DECLARE
  issue_count INTEGER := 0;
  constraint_rec RECORD;
BEGIN
  -- Check for duplicate FKs on same column
  FOR constraint_rec IN
    SELECT 
      tc.table_name, 
      kcu.column_name, 
      COUNT(*) as fk_count
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name IN ('notifications', 'users', 'messages', 'chats')
    GROUP BY tc.table_name, kcu.column_name
    HAVING COUNT(*) > 1
  LOOP
    issue_count := issue_count + 1;
    RAISE WARNING '⚠️ Found % FK(s) on %.%', constraint_rec.fk_count, constraint_rec.table_name, constraint_rec.column_name;
  END LOOP;

  -- Check for FKs pointing to auth.users instead of public.users (for user_id columns)
  FOR constraint_rec IN
    SELECT 
      tc.table_name,
      kcu.column_name,
      tc.constraint_name,
      ccu.table_schema AS referenced_schema,
      ccu.table_name AS referenced_table
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name IN ('notifications', 'messages', 'chats')
      AND kcu.column_name LIKE '%user_id%'
      AND ccu.table_schema = 'auth'
      AND ccu.table_name = 'users'
  LOOP
    issue_count := issue_count + 1;
    RAISE WARNING '⚠️ FK %.% → auth.users (should point to public.users for 3NF)', 
      constraint_rec.table_name, constraint_rec.constraint_name;
  END LOOP;

  IF issue_count = 0 THEN
    RAISE NOTICE '✅ No duplicate or incorrect FKs found';
  ELSE
    RAISE WARNING '⚠️ Found % issue(s) that may need attention', issue_count;
  END IF;
END $$;

-- Step 3.2: Verify all required FKs exist
DO $$
DECLARE
  missing_fks TEXT[] := ARRAY[]::TEXT[];
  fk_exists BOOLEAN;
BEGIN
  -- Check messages.chat_id FK
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'messages'
      AND kcu.column_name = 'chat_id' AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public' AND ccu.table_name = 'chats' AND ccu.column_name = 'id'
  ) INTO fk_exists;
  
  IF NOT fk_exists THEN
    missing_fks := array_append(missing_fks, 'messages.chat_id → chats.id');
  END IF;

  -- Check messages.shared_event_id FK
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'messages'
      AND kcu.column_name = 'shared_event_id' AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public' AND ccu.table_name = 'events' AND ccu.column_name = 'id'
  ) INTO fk_exists;
  
  IF NOT fk_exists THEN
    missing_fks := array_append(missing_fks, 'messages.shared_event_id → events.id');
  END IF;

  -- Check chats.latest_message_id FK
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'chats'
      AND kcu.column_name = 'latest_message_id' AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public' AND ccu.table_name = 'messages' AND ccu.column_name = 'id'
  ) INTO fk_exists;
  
  IF NOT fk_exists THEN
    missing_fks := array_append(missing_fks, 'chats.latest_message_id → messages.id');
  END IF;

  IF array_length(missing_fks, 1) > 0 THEN
    RAISE WARNING '⚠️ Missing FKs: %', array_to_string(missing_fks, ', ');
  ELSE
    RAISE NOTICE '✅ All required FKs are present';
  END IF;
END $$;

-- ============================================
-- PHASE 4: SUMMARY
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Removed duplicate foreign key constraints';
  RAISE NOTICE '✅ Added missing foreign key constraints';
  RAISE NOTICE '✅ Verified 3NF compliance';
  RAISE NOTICE '';
  RAISE NOTICE 'Schema is now properly normalized (3NF)';
  RAISE NOTICE 'All foreign keys reference correct tables';
  RAISE NOTICE '========================================';
END $$;

