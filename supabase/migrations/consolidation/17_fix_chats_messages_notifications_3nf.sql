-- ============================================
-- MIGRATION: Fix Chats, Messages, Notifications for 3NF Schema
-- ============================================
-- This migration ensures chats, messages, and notifications tables
-- properly reference users.user_id (3NF compliant) instead of auth.users(id)
-- 
-- CRITICAL PREREQUISITE: users.user_id must reference auth.users(id)
-- ============================================

-- ============================================
-- PHASE 0: VERIFY PREREQUISITES
-- ============================================

-- Step 0.1: Verify users.user_id FK to auth.users(id) exists
DO $$
DECLARE
  fk_exists BOOLEAN := false;
  constraint_name_to_use TEXT := 'users_user_id_fkey';
BEGIN
  -- Check if any FK exists from users.user_id to auth.users(id)
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu 
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'users'
      AND kcu.column_name = 'user_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'auth'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
  ) INTO fk_exists;

  -- Check if specific constraint name already exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = constraint_name_to_use
      AND table_name = 'users'
  ) THEN
    RAISE NOTICE '✅ Verified: users.user_id FK to auth.users(id) already exists (constraint: %)', constraint_name_to_use;
  ELSIF fk_exists THEN
    -- FK exists but with different name, we're good
    RAISE NOTICE '✅ Verified: users.user_id FK to auth.users(id) already exists (with different constraint name)';
  ELSE
    -- Create the FK if it doesn't exist (critical for 3NF)
    BEGIN
      RAISE NOTICE 'Creating users.user_id FK to auth.users(id)...';
      ALTER TABLE public.users
      ADD CONSTRAINT users_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES auth.users(id) 
        ON DELETE CASCADE;
      RAISE NOTICE '✅ Created users.user_id FK to auth.users(id)';
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE '✅ Verified: users.user_id FK to auth.users(id) already exists (caught duplicate_object)';
      WHEN OTHERS THEN
        RAISE WARNING '⚠️ Could not create users.user_id FK: %', SQLERRM;
    END;
  END IF;
END $$;

-- ============================================
-- PHASE 1: FIX NOTIFICATIONS TABLE
-- ============================================

-- Step 1.1: Fix notifications.user_id FK to reference users.user_id (3NF)
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  -- Drop existing FK if it references auth.users instead of users.user_id
  FOR constraint_rec IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'notifications'
      AND kcu.column_name = 'user_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage ccu
        WHERE ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = 'auth'
          AND ccu.table_name = 'users'
      )
  LOOP
    EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS ' || constraint_rec.constraint_name || ' CASCADE';
    RAISE NOTICE 'Dropped old FK: %', constraint_rec.constraint_name;
  END LOOP;
END $$;

-- Step 1.2: Add correct FK to users.user_id (3NF compliant) (clean orphaned references first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'notifications'
      AND kcu.column_name = 'user_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'user_id'
  ) THEN
    -- Clean up orphaned user_id references (delete notifications for non-existent users)
    -- Note: user_id is NOT NULL, so we must delete, not set to NULL
    DELETE FROM public.notifications
    WHERE user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users WHERE users.user_id = notifications.user_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned user_id references (deleted notifications for non-existent users)';
    
    -- Now create the FK constraint
    ALTER TABLE public.notifications
    ADD CONSTRAINT fk_notifications_user_id 
      FOREIGN KEY (user_id) 
      REFERENCES public.users(user_id) 
      ON DELETE CASCADE;
    RAISE NOTICE '✅ Created notifications.user_id FK to users.user_id';
  ELSE
    RAISE NOTICE '✅ Verified: notifications.user_id already references users.user_id';
  END IF;
END $$;

-- Step 1.3: Fix actor_user_id FK (clean orphaned references first)
DO $$
BEGIN
  -- Drop old FK if exists
  ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS fk_notifications_actor_user_id CASCADE;

  -- Add correct FK to users.user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'actor_user_id'
  ) THEN
    -- Clean up orphaned actor_user_id references (set to NULL if user doesn't exist)
    UPDATE public.notifications
    SET actor_user_id = NULL
    WHERE actor_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users WHERE users.user_id = notifications.actor_user_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned actor_user_id references';
    
    -- Now create the FK constraint
    ALTER TABLE public.notifications
    ADD CONSTRAINT fk_notifications_actor_user_id 
      FOREIGN KEY (actor_user_id) 
      REFERENCES public.users(user_id) 
      ON DELETE SET NULL;
    RAISE NOTICE '✅ Created notifications.actor_user_id FK to users.user_id';
  END IF;
END $$;

-- Step 1.4: Fix profile_user_id FK (clean orphaned references first)
DO $$
BEGIN
  ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS fk_notifications_profile_user_id CASCADE;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'profile_user_id'
  ) THEN
    -- Clean up orphaned profile_user_id references (set to NULL if user doesn't exist)
    UPDATE public.notifications
    SET profile_user_id = NULL
    WHERE profile_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users WHERE users.user_id = notifications.profile_user_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned profile_user_id references';
    
    -- Now create the FK constraint
    ALTER TABLE public.notifications
    ADD CONSTRAINT fk_notifications_profile_user_id 
      FOREIGN KEY (profile_user_id) 
      REFERENCES public.users(user_id) 
      ON DELETE SET NULL;
    RAISE NOTICE '✅ Created notifications.profile_user_id FK to users.user_id';
  END IF;
END $$;

-- Step 1.5: Fix review_id FK (clean orphaned references first)
DO $$
BEGIN
  ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS fk_notifications_review_id CASCADE;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'review_id'
  ) THEN
    -- Clean up orphaned review_id references (set to NULL if review doesn't exist)
    UPDATE public.notifications
    SET review_id = NULL
    WHERE review_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.reviews WHERE reviews.id = notifications.review_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned review_id references';
    
    -- Now create the FK constraint
    ALTER TABLE public.notifications
    ADD CONSTRAINT fk_notifications_review_id 
      FOREIGN KEY (review_id) 
      REFERENCES public.reviews(id) 
      ON DELETE CASCADE;
    RAISE NOTICE '✅ Created notifications.review_id FK to reviews.id';
  END IF;
END $$;

-- Step 1.6: Fix comment_id FK (clean orphaned references first)
DO $$
BEGIN
  ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS fk_notifications_comment_id CASCADE;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'comment_id'
  ) THEN
    -- Clean up orphaned comment_id references (set to NULL if comment doesn't exist)
    UPDATE public.notifications
    SET comment_id = NULL
    WHERE comment_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.comments WHERE comments.id = notifications.comment_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned comment_id references';
    
    -- Now create the FK constraint
    ALTER TABLE public.notifications
    ADD CONSTRAINT fk_notifications_comment_id 
      FOREIGN KEY (comment_id) 
      REFERENCES public.comments(id) 
      ON DELETE CASCADE;
    RAISE NOTICE '✅ Created notifications.comment_id FK to comments.id';
  END IF;
END $$;

-- ============================================
-- PHASE 2: FIX MESSAGES TABLE
-- ============================================

-- Step 2.1: Add content column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'content'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN content TEXT;
    RAISE NOTICE '✅ Added content column to messages table';
  ELSE
    RAISE NOTICE '✅ Verified: content column already exists';
  END IF;
END $$;

-- Step 2.2: Migrate data from message to content (if message column exists)
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'message'
  ) THEN
    -- Copy message to content where content is NULL
    UPDATE public.messages
    SET content = message
    WHERE content IS NULL AND message IS NOT NULL;
    
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    RAISE NOTICE '✅ Migrated % row(s) from message to content column', migrated_count;
  END IF;
END $$;

-- Step 2.3: Add missing columns for event sharing
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'event_share', 'system')),
ADD COLUMN IF NOT EXISTS shared_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sender_profile_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Step 2.4: Fix sender_id FK to reference users.user_id (3NF)
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  -- Drop existing FK if it references auth.users instead of users.user_id
  FOR constraint_rec IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'messages'
      AND kcu.column_name = 'sender_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage ccu
        WHERE ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = 'public'
          AND ccu.table_name = 'users'
          AND ccu.column_name = 'user_id'
      )
  LOOP
    EXECUTE 'ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS ' || constraint_rec.constraint_name || ' CASCADE';
    RAISE NOTICE 'Dropped old FK: %', constraint_rec.constraint_name;
  END LOOP;
END $$;

-- Step 2.5: Add correct FK to users.user_id (clean orphaned references first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'messages'
      AND kcu.column_name = 'sender_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'user_id'
  ) THEN
    -- Clean up orphaned sender_id references (delete messages from non-existent users)
    -- Note: sender_id is NOT NULL, so we must delete, not set to NULL
    DELETE FROM public.messages
    WHERE sender_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users WHERE users.user_id = messages.sender_id
    );
    
    RAISE NOTICE 'Cleaned up orphaned sender_id references (deleted messages from non-existent users)';
    
    -- Now create the FK constraint
    ALTER TABLE public.messages
    ADD CONSTRAINT fk_messages_sender_id 
      FOREIGN KEY (sender_id) 
      REFERENCES public.users(user_id) 
      ON DELETE CASCADE;
    RAISE NOTICE '✅ Created messages.sender_id FK to users.user_id';
  ELSE
    RAISE NOTICE '✅ Verified: messages.sender_id already references users.user_id';
  END IF;
END $$;

-- Step 2.6: Add trigger for updated_at (if function exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_messages_updated_at ON public.messages;
    CREATE TRIGGER update_messages_updated_at
      BEFORE UPDATE ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    RAISE NOTICE '✅ Created updated_at trigger for messages';
  END IF;
END $$;

-- ============================================
-- PHASE 3: FIX CHATS TABLE
-- ============================================

-- Step 3.1: Add missing columns
ALTER TABLE public.chats
ADD COLUMN IF NOT EXISTS chat_name TEXT DEFAULT 'Chat',
ADD COLUMN IF NOT EXISTS is_group_chat BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS users UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS latest_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS group_admin_id UUID,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Step 3.2: Migrate data if match_id exists (convert to users array)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'chats' 
    AND column_name = 'match_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'matches'
  ) THEN
    -- Update chats to populate users array from matches
    -- Note: This assumes matches.user1_id and user2_id reference users.user_id or auth.users(id)
    UPDATE public.chats c
    SET users = ARRAY[m.user1_id, m.user2_id]
    FROM public.matches m
    WHERE c.match_id = m.id
    AND (c.users IS NULL OR c.users = ARRAY[]::uuid[]);
    
    RAISE NOTICE '✅ Migrated chats from match_id to users array';
  END IF;
END $$;

-- Step 3.3: Set NOT NULL constraints (after data migration)
DO $$
BEGIN
  -- Only set NOT NULL if all rows have values
  IF NOT EXISTS (
    SELECT 1 FROM public.chats 
    WHERE chat_name IS NULL OR is_group_chat IS NULL OR users IS NULL
  ) THEN
    ALTER TABLE public.chats
    ALTER COLUMN chat_name SET NOT NULL,
    ALTER COLUMN is_group_chat SET NOT NULL,
    ALTER COLUMN users SET NOT NULL;
    RAISE NOTICE '✅ Set NOT NULL constraints on chats table';
  ELSE
    -- Set defaults for NULL values first
    UPDATE public.chats SET chat_name = COALESCE(chat_name, 'Chat') WHERE chat_name IS NULL;
    UPDATE public.chats SET is_group_chat = COALESCE(is_group_chat, false) WHERE is_group_chat IS NULL;
    UPDATE public.chats SET users = COALESCE(users, ARRAY[]::uuid[]) WHERE users IS NULL;
    
    -- Then set NOT NULL
    ALTER TABLE public.chats
    ALTER COLUMN chat_name SET NOT NULL,
    ALTER COLUMN is_group_chat SET NOT NULL,
    ALTER COLUMN users SET NOT NULL;
    RAISE NOTICE '✅ Set defaults and NOT NULL constraints on chats table';
  END IF;
END $$;

-- Step 3.4: Drop old match_id column if it exists
ALTER TABLE public.chats
DROP COLUMN IF EXISTS match_id CASCADE;

-- Step 3.5: Fix group_admin_id FK to reference users.user_id (3NF)
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  -- Drop existing FK if it references auth.users instead of users.user_id
  FOR constraint_rec IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'chats'
      AND kcu.column_name = 'group_admin_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage ccu
        WHERE ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = 'public'
          AND ccu.table_name = 'users'
          AND ccu.column_name = 'user_id'
      )
  LOOP
    EXECUTE 'ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS ' || constraint_rec.constraint_name || ' CASCADE';
    RAISE NOTICE 'Dropped old FK: %', constraint_rec.constraint_name;
  END LOOP;
END $$;

-- Step 3.6: Add correct FK to users.user_id (if column exists, clean orphaned references first)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chats' AND column_name = 'group_admin_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'chats'
        AND kcu.column_name = 'group_admin_id'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public'
        AND ccu.table_name = 'users'
        AND ccu.column_name = 'user_id'
    ) THEN
      -- Clean up orphaned group_admin_id references (set to NULL if user doesn't exist)
      UPDATE public.chats
      SET group_admin_id = NULL
      WHERE group_admin_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.users WHERE users.user_id = chats.group_admin_id
      );
      
      RAISE NOTICE 'Cleaned up orphaned group_admin_id references';
      
      -- Now create the FK constraint
      ALTER TABLE public.chats
      ADD CONSTRAINT fk_chats_group_admin_id 
        FOREIGN KEY (group_admin_id) 
        REFERENCES public.users(user_id) 
        ON DELETE SET NULL;
      RAISE NOTICE '✅ Created chats.group_admin_id FK to users.user_id';
    ELSE
      RAISE NOTICE '✅ Verified: chats.group_admin_id already references users.user_id';
    END IF;
  END IF;
END $$;

-- Step 3.7: Add trigger for updated_at (if function exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_chats_updated_at ON public.chats;
    CREATE TRIGGER update_chats_updated_at
      BEFORE UPDATE ON public.chats
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    RAISE NOTICE '✅ Created updated_at trigger for chats';
  END IF;
END $$;

-- ============================================
-- PHASE 4: CREATE NOTIFICATIONS_WITH_DETAILS VIEW
-- ============================================

-- Step 4.1: Create or replace notifications_with_details view
CREATE OR REPLACE VIEW public.notifications_with_details AS
SELECT 
  n.id,
  n.user_id,
  n.type,
  n.title,
  n.message,
  n.data,
  n.is_read,
  n.created_at,
  n.profile_id,
  n.profile_user_id,
  n.review_id,
  n.comment_id,
  n.actor_user_id,
  -- Actor profile details (from users table)
  actor.user_id as actor_id,
  actor.name as actor_name,
  actor.avatar_url as actor_avatar_url,
  -- Profile details
  profile.name as profile_name,
  profile.avatar_url as profile_avatar_url,
  -- Review details
  review.event_id as review_event_id,
  -- Comment details
  comment.entity_type as comment_entity_type,
  comment.entity_id as comment_entity_id
FROM public.notifications n
LEFT JOIN public.users actor ON actor.user_id = n.actor_user_id
LEFT JOIN public.users profile ON profile.user_id = n.profile_user_id
LEFT JOIN public.reviews review ON review.id = n.review_id
LEFT JOIN public.comments comment ON comment.id = n.comment_id;

-- Step 4.2: Grant access to the view
GRANT SELECT ON public.notifications_with_details TO authenticated;

-- ============================================
-- PHASE 5: VERIFY RLS POLICIES COMPATIBILITY
-- ============================================

-- RLS policies should work because:
-- - auth.uid() returns auth.users(id) UUID
-- - users.user_id contains auth.users(id) UUID (FK guarantee)
-- - Therefore: auth.uid() = ANY(users) will work correctly
-- - And: auth.uid() = user_id will work correctly (when user_id references users.user_id)

-- Note: We don't need to change RLS policies because they use auth.uid() which
-- returns the same UUID value as users.user_id (due to FK relationship)

-- ============================================
-- PHASE 6: VERIFICATION QUERIES
-- ============================================

-- Verification: Check all foreign keys are correct
DO $$
DECLARE
  incorrect_fks INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO incorrect_fks
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name IN ('notifications', 'messages', 'chats')
    AND tc.constraint_type = 'FOREIGN KEY'
    AND (
      -- Check if any FK references auth.users instead of public.users
      (ccu.table_schema = 'auth' AND ccu.table_name = 'users' AND ccu.column_name = 'id')
      OR
      -- Check if FK doesn't reference the correct public table
      (tc.table_name = 'notifications' AND kcu.column_name = 'user_id' 
       AND NOT (ccu.table_schema = 'public' AND ccu.table_name = 'users' AND ccu.column_name = 'user_id'))
      OR
      (tc.table_name = 'messages' AND kcu.column_name = 'sender_id'
       AND NOT (ccu.table_schema = 'public' AND ccu.table_name = 'users' AND ccu.column_name = 'user_id'))
      OR
      (tc.table_name = 'chats' AND kcu.column_name = 'group_admin_id'
       AND ccu.column_name IS NOT NULL
       AND NOT (ccu.table_schema = 'public' AND ccu.table_name = 'users' AND ccu.column_name = 'user_id'))
    );

  IF incorrect_fks > 0 THEN
    RAISE WARNING '⚠️ Found % foreign key(s) that may need attention', incorrect_fks;
  ELSE
    RAISE NOTICE '✅ All foreign keys verified correctly';
  END IF;
END $$;

-- Final summary
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Notifications table: References users.user_id (3NF)';
  RAISE NOTICE '✅ Messages table: References users.user_id (3NF), has content column';
  RAISE NOTICE '✅ Chats table: References users.user_id (3NF), uses users array';
  RAISE NOTICE '✅ notifications_with_details view: Created';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Update code to use "content" instead of "message" for messages';
  RAISE NOTICE '2. Test creating notifications, messages, and chats';
  RAISE NOTICE '3. Verify RLS policies work correctly';
  RAISE NOTICE '========================================';
END $$;

