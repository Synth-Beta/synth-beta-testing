-- ============================================================
-- Cleanup Duplicate Chat Participants and Fix Member Counts
-- ============================================================
-- This migration removes duplicate entries in chat_participants
-- and recalculates member_count for all chats
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: REMOVE DUPLICATE chat_participants ENTRIES
-- ============================================================
-- Keep the oldest entry for each (chat_id, user_id) pair

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- Delete duplicates, keeping the one with the earliest joined_at
  WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY chat_id, user_id 
             ORDER BY joined_at ASC
           ) as rn
    FROM public.chat_participants
  )
  DELETE FROM public.chat_participants
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );
  
  GET DIAGNOSTICS duplicate_count = ROW_COUNT;
  
  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Removed % duplicate chat_participants entries', duplicate_count;
  ELSE
    RAISE NOTICE 'No duplicate chat_participants entries found';
  END IF;
END $$;

-- ============================================================
-- STEP 2: RECALCULATE member_count FOR ALL CHATS
-- ============================================================
-- Sync member_count from chat_participants table

UPDATE public.chats c
SET member_count = (
  SELECT COUNT(*)::integer
  FROM public.chat_participants cp
  WHERE cp.chat_id = c.id
)
WHERE EXISTS (
  SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = c.id
);

-- Set member_count to 0 for chats with no participants
UPDATE public.chats
SET member_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_participants cp 
  WHERE cp.chat_id = chats.id
);

-- ============================================================
-- STEP 3: ENSURE users ARRAY IS IN SYNC
-- ============================================================
-- The trigger should handle this, but let's manually sync to be safe

UPDATE public.chats c
SET users = (
  SELECT COALESCE(ARRAY_AGG(user_id ORDER BY joined_at), ARRAY[]::UUID[])
  FROM public.chat_participants cp
  WHERE cp.chat_id = c.id
)
WHERE EXISTS (
  SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = c.id
);

-- Set users to empty array for chats with no participants
UPDATE public.chats
SET users = ARRAY[]::UUID[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_participants cp 
  WHERE cp.chat_id = chats.id
);

-- ============================================================
-- STEP 4: VERIFICATION
-- ============================================================

DO $$
DECLARE
  total_chats INTEGER;
  chats_with_participants INTEGER;
  total_participants INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_chats FROM public.chats;
  SELECT COUNT(DISTINCT chat_id) INTO chats_with_participants FROM public.chat_participants;
  SELECT COUNT(*) INTO total_participants FROM public.chat_participants;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Chat Participants Cleanup Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total chats: %', total_chats;
  RAISE NOTICE 'Chats with participants: %', chats_with_participants;
  RAISE NOTICE 'Total participants: %', total_participants;
  RAISE NOTICE '✅ Duplicate entries removed';
  RAISE NOTICE '✅ member_count recalculated';
  RAISE NOTICE '✅ users arrays synced';
  RAISE NOTICE '========================================';
END $$;

COMMIT;

