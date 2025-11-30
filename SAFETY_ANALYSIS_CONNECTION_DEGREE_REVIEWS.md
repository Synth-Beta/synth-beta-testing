# Safety Analysis: CREATE_CONNECTION_DEGREE_REVIEWS_SYSTEM.sql

## ⚠️ **CRITICAL ISSUES TO CHECK BEFORE RUNNING**

### 1. **Table Name Verification Required**

The SQL file uses these table names:
- `public.reviews` (line 129)
- `public.users` (line 130)  
- `public.events` (line 131)

**However, your database might still use the OLD names:**
- `public.user_reviews` (instead of `reviews`)
- `public.profiles` (instead of `users`)
- `public.jambase_events` (instead of `events`)

### 2. **How to Check Your Current Table Names**

Run this query in Supabase SQL Editor to verify:

```sql
-- Check which review table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('reviews', 'user_reviews');

-- Check which user/profile table exists  
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'profiles');

-- Check which events table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('events', 'jambase_events');
```

### 3. **What This SQL File Does**

✅ **SAFE Operations (Idempotent):**
- Uses `CREATE OR REPLACE FUNCTION` - won't break if already exists
- Uses `CREATE OR REPLACE VIEW` - will update existing view
- Only adds permissions, doesn't revoke anything
- No DROP statements that would delete data

⚠️ **POTENTIAL ISSUES:**
- If tables don't exist with expected names, the view will fail to create
- If the view already exists with wrong table names, it will be replaced
- The function will fail if dependencies (like `get_connection_degree`) don't exist

### 4. **Impact on Existing Database**

**If view/function already exists:**
- ✅ Will be replaced with new definition (including the `account_type::TEXT` fix)
- ✅ No data loss (views don't store data)
- ⚠️ Any queries currently using the view will use the new definition immediately

**If view/function doesn't exist:**
- ✅ Will create new view and function
- ✅ No impact on existing tables or data

### 5. **Migration Safety**

**This file is NOT a migration file** - it's a standalone SQL script. This means:
- ✅ Safe to run multiple times (idempotent)
- ✅ Won't conflict with Supabase migration system
- ⚠️ Won't be tracked in migration history
- ⚠️ If you run migrations later that create these objects, there might be conflicts

### 6. **Recommended Approach**

**Option A: If tables are named `reviews`, `users`, `events` (post-consolidation)**
- ✅ Safe to run as-is
- The `account_type::TEXT` cast fix is already included

**Option B: If tables are still named `user_reviews`, `profiles`, `jambase_events`**
- ❌ Will fail - need to update table names first
- See fix below

### 7. **If You Need to Fix Table Names**

If your database uses old table names, update these lines in the SQL file:

```sql
-- Line 129: Change FROM public.reviews ur
FROM public.user_reviews ur

-- Line 130: Change JOIN public.users p  
JOIN public.profiles p

-- Line 131: Change JOIN public.events je
JOIN public.jambase_events je
```

### 8. **Dependencies Required**

This SQL file requires these functions to exist:
- `public.get_connection_degree(UUID, UUID)` 
- `public.get_connection_info(UUID, UUID)`

If these don't exist, the view will fail to create.

### 9. **Testing Before Full Deployment**

Run this test query first (after fixing table names if needed):

```sql
-- Test if the view can be created (dry run)
SELECT 
  ur.id as review_id,
  ur.user_id as reviewer_id,
  p.name as reviewer_name,
  p.account_type::TEXT as reviewer_account_type
FROM public.reviews ur  -- or public.user_reviews
JOIN public.users p ON ur.user_id = p.user_id  -- or public.profiles
LIMIT 1;
```

If this query works, the full SQL file should work.

## ✅ **RECOMMENDATION**

1. **First**: Run the table name verification queries above
2. **Second**: If table names don't match, update the SQL file
3. **Third**: Test with the dry-run query
4. **Fourth**: Run the full SQL file in Supabase SQL Editor
5. **Fifth**: Test the RPC function with a real user_id

The SQL file is **safe to run** once table names are verified/corrected, as it uses `CREATE OR REPLACE` which is idempotent.

