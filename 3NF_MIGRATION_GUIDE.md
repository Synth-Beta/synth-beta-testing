# 🎯 3NF Migration Guide - Step by Step

## ✅ What You Need to Run

You need to run **2 migrations** in this order:

1. **Migration 17** - Fix chats, messages, notifications for 3NF
2. **Migration 18** - Fix duplicate FKs and missing constraints

---

## 📋 Step-by-Step Instructions

### **Step 1: Run Migration 17**

**File:** `supabase/migrations/consolidation/17_fix_chats_messages_notifications_3nf.sql`

**What it does:**
- ✅ Verifies `users.user_id` FK to `auth.users(id)` exists
- ✅ Fixes `notifications` table to reference `users.user_id` (3NF)
- ✅ Fixes `messages` table to reference `users.user_id` (3NF)
- ✅ Fixes `chats` table to reference `users.user_id` (3NF)
- ✅ Adds `content` column to `messages` table
- ✅ Migrates data from `message` to `content` column
- ✅ Creates `notifications_with_details` view
- ✅ Cleans up orphaned foreign key references

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy the entire contents of `17_fix_chats_messages_notifications_3nf.sql`
3. Paste into SQL Editor
4. Click "Run" or press `Ctrl+Enter`
5. Check the output messages for any warnings

**Expected output:**
```
✅ Verified: users.user_id FK to auth.users(id) exists
✅ Created notifications.user_id FK to users.user_id
✅ Created messages.sender_id FK to users.user_id
✅ Created chats.group_admin_id FK to users.user_id
✅ Migrated X row(s) from message to content column
✅ Created notifications_with_details view
Migration Complete!
```

---

### **Step 2: Run Migration 18**

**File:** `supabase/migrations/consolidation/18_fix_duplicate_fks_and_missing_constraints.sql`

**What it does:**
- ✅ Removes duplicate `actor_user_id` FK in `notifications` table
- ✅ Removes duplicate `user_id` FK in `users` table
- ✅ Adds missing `fk_messages_chat_id` FK
- ✅ Adds missing `fk_messages_shared_event_id` FK
- ✅ Adds missing `fk_chats_latest_message_id` FK
- ✅ Verifies all FKs are correct (3NF compliant)

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy the entire contents of `18_fix_duplicate_fks_and_missing_constraints.sql`
3. Paste into SQL Editor
4. Click "Run" or press `Ctrl+Enter`
5. Check the output messages for any warnings

**Expected output:**
```
✅ Removed X duplicate actor_user_id FK(s)
✅ Removed X duplicate user_id FK(s)
✅ Created messages.chat_id FK to chats.id
✅ Created messages.shared_event_id FK to events.id
✅ Created chats.latest_message_id FK to messages.id
✅ All required FKs are present
Migration Complete!
```

---

## 🔍 Step 3: Verify Everything is Good

After running both migrations, run this verification script to make sure everything is correct:

```sql
-- ============================================
-- VERIFICATION: Check 3NF Compliance
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

-- Check 2: Verify all user_id columns reference public.users (3NF)
SELECT 
  '3NF Compliance Check' as check_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS referenced_schema,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  CASE 
    WHEN kcu.column_name LIKE '%user_id%' AND ccu.table_schema = 'auth' THEN '❌ FAIL - Points to auth.users (not 3NF)'
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

-- Summary
SELECT 
  '========================================' as summary
UNION ALL
SELECT '✅ All checks complete!'
UNION ALL
SELECT 'If you see any ❌ FAIL, review the migration output above.'
UNION ALL
SELECT '========================================';
```

**Run this verification script in Supabase SQL Editor after both migrations.**

---

## 🎯 Summary

**What to run:**
1. ✅ Migration 17 - Fix chats/messages/notifications for 3NF
2. ✅ Migration 18 - Fix duplicate FKs and missing constraints
3. ✅ Verification script - Confirm everything is correct

**Expected time:** 5-10 minutes total

**If you see errors:**
- Check the error message
- Most errors are handled by the migrations (they clean up orphaned data)
- If you see warnings, they're usually informational (like "already exists")

---

## ✅ Success Criteria

After running both migrations, you should have:

- ✅ No duplicate foreign key constraints
- ✅ All `user_id` columns reference `public.users(user_id)` (except `users.user_id` which references `auth.users(id)`)
- ✅ All required foreign keys exist:
  - `messages.chat_id` → `chats.id`
  - `messages.shared_event_id` → `events.id`
  - `chats.latest_message_id` → `messages.id`
- ✅ `notifications_with_details` view exists and works
- ✅ All tables are properly normalized (3NF compliant)

---

## 🚨 Troubleshooting

**Error: "relation does not exist"**
- Make sure you've run the previous consolidation migrations first
- Check that the table names match your schema

**Error: "foreign key constraint violation"**
- The migrations automatically clean up orphaned data
- If you still see this, check which table/column is causing the issue

**Warning: "already exists"**
- This is normal - the migrations check before creating
- Not an error, just informational

---

## 📞 Need Help?

If you run into issues:
1. Copy the error message
2. Check which migration step failed
3. Review the migration file comments for that section

Good luck! 🚀

