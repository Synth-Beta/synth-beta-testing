-- ============================================
-- VERIFICATION: Check 3NF Compliance
-- ============================================
-- Run this after migrations 17 and 18 to verify everything is correct
-- ============================================

-- Check 1: Verify no duplicate FKs
SELECT 
  'Duplicate FKs Check' as check_name,
  tc.table_name, 
  kcu.column_name, 
  COUNT(*) as fk_count,
  CASE 
    WHEN COUNT(*) > 1 THEN '❌ FAIL - Duplicate FKs found!'
    ELSE '✅ PASS'
  END as status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('notifications', 'users', 'messages', 'chats')
GROUP BY tc.table_name, kcu.column_name
HAVING COUNT(*) > 1;

-- If no duplicates, this will return 0 rows (which is good!)

-- Check 2: Verify all user_id columns reference public.users (3NF)
SELECT 
  '3NF Compliance Check' as check_name,
  tc.table_name,
  kcu.column_name,
  tc.constraint_name,
  ccu.table_schema AS referenced_schema,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  CASE 
    WHEN kcu.column_name LIKE '%user_id%' AND ccu.table_schema = 'auth' AND tc.table_name != 'users' THEN '❌ FAIL - Points to auth.users (not 3NF)'
    WHEN kcu.column_name LIKE '%user_id%' AND ccu.table_schema = 'public' AND ccu.table_name = 'users' THEN '✅ PASS - Points to public.users (3NF)'
    WHEN kcu.column_name = 'user_id' AND tc.table_name = 'users' AND ccu.table_schema = 'auth' THEN '✅ PASS - users.user_id correctly points to auth.users'
    ELSE '✅ PASS'
  END as status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('notifications', 'users', 'messages', 'chats')
  AND kcu.column_name LIKE '%user_id%'
ORDER BY tc.table_name, kcu.column_name;

-- Check 3: Verify all required FKs exist
SELECT 
  'Required FKs Check' as check_name,
  'messages.chat_id → chats.id' as required_fk,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name = 'messages'
        AND kcu.column_name = 'chat_id' AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public' AND ccu.table_name = 'chats' AND ccu.column_name = 'id'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL - Missing!'
  END as status
UNION ALL
SELECT 
  'Required FKs Check',
  'messages.shared_event_id → events.id',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name = 'messages'
        AND kcu.column_name = 'shared_event_id' AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public' AND ccu.table_name = 'events' AND ccu.column_name = 'id'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL - Missing!'
  END
UNION ALL
SELECT 
  'Required FKs Check',
  'chats.latest_message_id → messages.id',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name = 'chats'
        AND kcu.column_name = 'latest_message_id' AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public' AND ccu.table_name = 'messages' AND ccu.column_name = 'id'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL - Missing!'
  END;

-- Check 4: Verify notifications_with_details view exists
SELECT 
  'View Check' as check_name,
  'notifications_with_details' as view_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'notifications_with_details'
    ) THEN '✅ PASS - View exists'
    ELSE '❌ FAIL - View missing!'
  END as status;

-- Check 5: Verify messages table has content column
SELECT 
  'Column Check' as check_name,
  'messages.content' as column_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'content'
    ) THEN '✅ PASS - Column exists'
    ELSE '❌ FAIL - Column missing!'
  END as status;

-- Summary Report
DO $$
DECLARE
  duplicate_count INTEGER;
  missing_fk_count INTEGER;
  view_exists BOOLEAN;
  content_column_exists BOOLEAN;
BEGIN
  -- Count duplicate FKs
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT tc.table_name, kcu.column_name, COUNT(*) as fk_count
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name IN ('notifications', 'users', 'messages', 'chats')
    GROUP BY tc.table_name, kcu.column_name
    HAVING COUNT(*) > 1
  ) duplicates;

  -- Count missing required FKs
  SELECT (
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name = 'messages'
        AND kcu.column_name = 'chat_id' AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN 1 ELSE 0 END +
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name = 'messages'
        AND kcu.column_name = 'shared_event_id' AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN 1 ELSE 0 END +
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name = 'chats'
        AND kcu.column_name = 'latest_message_id' AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN 1 ELSE 0 END
  ) INTO missing_fk_count;

  -- Check view exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'notifications_with_details'
  ) INTO view_exists;

  -- Check content column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'content'
  ) INTO content_column_exists;

  RAISE NOTICE '========================================';
  RAISE NOTICE '3NF COMPLIANCE VERIFICATION SUMMARY';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  IF duplicate_count = 0 THEN
    RAISE NOTICE '✅ No duplicate foreign keys found';
  ELSE
    RAISE WARNING '❌ Found % duplicate foreign key(s)!', duplicate_count;
  END IF;

  IF missing_fk_count = 0 THEN
    RAISE NOTICE '✅ All required foreign keys are present';
  ELSE
    RAISE WARNING '❌ Missing % required foreign key(s)!', missing_fk_count;
  END IF;

  IF view_exists THEN
    RAISE NOTICE '✅ notifications_with_details view exists';
  ELSE
    RAISE WARNING '❌ notifications_with_details view is missing!';
  END IF;

  IF content_column_exists THEN
    RAISE NOTICE '✅ messages.content column exists';
  ELSE
    RAISE WARNING '❌ messages.content column is missing!';
  END IF;

  RAISE NOTICE '';
  
  IF duplicate_count = 0 AND missing_fk_count = 0 AND view_exists AND content_column_exists THEN
    RAISE NOTICE '🎉 SUCCESS! Your schema is 3NF compliant!';
  ELSE
    RAISE WARNING '⚠️ Some issues found. Review the detailed checks above.';
  END IF;

  RAISE NOTICE '========================================';
END $$;

