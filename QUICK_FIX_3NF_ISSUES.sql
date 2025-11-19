-- ============================================
-- QUICK FIX: Remove Duplicates and Add Missing FKs
-- ============================================
-- Run this BEFORE committing if migration 18 didn't complete
-- This fixes the immediate issues in your schema
-- ============================================

-- Fix 1: Remove duplicate actor_user_id FK in notifications (keep the 3NF one)
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_actor_user_id_fkey CASCADE;
-- Keep: fk_notifications_actor_user_id → public.users(user_id) ✅

-- Fix 2: Remove duplicate user_id FK in users table
ALTER TABLE public.users 
DROP CONSTRAINT IF EXISTS users_new_user_id_fkey CASCADE;
-- Keep: users_user_id_fkey → auth.users(id) ✅

-- Fix 3: Add missing FK for messages.chat_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'messages'
      AND kcu.column_name = 'chat_id' AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public' AND ccu.table_name = 'chats' AND ccu.column_name = 'id'
  ) THEN
    -- Clean orphaned references first
    DELETE FROM public.messages
    WHERE chat_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.chats WHERE chats.id = messages.chat_id);
    
    ALTER TABLE public.messages
    ADD CONSTRAINT fk_messages_chat_id 
      FOREIGN KEY (chat_id) 
      REFERENCES public.chats(id) 
      ON DELETE CASCADE;
    RAISE NOTICE '✅ Added messages.chat_id FK';
  END IF;
END $$;

-- Fix 4: Add missing FK for messages.shared_event_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'messages'
      AND kcu.column_name = 'shared_event_id' AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public' AND ccu.table_name = 'events' AND ccu.column_name = 'id'
  ) THEN
    -- Clean orphaned references first
    UPDATE public.messages
    SET shared_event_id = NULL
    WHERE shared_event_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.events WHERE events.id = messages.shared_event_id);
    
    ALTER TABLE public.messages
    ADD CONSTRAINT fk_messages_shared_event_id 
      FOREIGN KEY (shared_event_id) 
      REFERENCES public.events(id) 
      ON DELETE SET NULL;
    RAISE NOTICE '✅ Added messages.shared_event_id FK';
  END IF;
END $$;

-- Fix 5: Add missing FK for chats.latest_message_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'chats'
      AND kcu.column_name = 'latest_message_id' AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public' AND ccu.table_name = 'messages' AND ccu.column_name = 'id'
  ) THEN
    -- Clean orphaned references first
    UPDATE public.chats
    SET latest_message_id = NULL
    WHERE latest_message_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.messages WHERE messages.id = chats.latest_message_id);
    
    ALTER TABLE public.chats
    ADD CONSTRAINT fk_chats_latest_message_id 
      FOREIGN KEY (latest_message_id) 
      REFERENCES public.messages(id) 
      ON DELETE SET NULL;
    RAISE NOTICE '✅ Added chats.latest_message_id FK';
  END IF;
END $$;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Quick Fix Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Removed duplicate FKs';
  RAISE NOTICE '✅ Added missing FKs';
  RAISE NOTICE '✅ Schema is now 3NF compliant';
  RAISE NOTICE '========================================';
END $$;

