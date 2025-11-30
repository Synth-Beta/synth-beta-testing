# Files to Run in Order - Fix account_type Type Mismatch Error

## 🎯 **Original Problem**
```
Error: Returned type account_type does not match expected type text in column 19
Function: get_connection_degree_reviews
Issue: View returns enum, function expects TEXT
```

## ✅ **Solution Order**

### **STEP 1: Quick Fix (Run This First)**
**File:** `FIX_ACCOUNT_TYPE_TYPE_MISMATCH.sql`

**What it does:**
- Immediately fixes the existing `reviews_with_connection_degree` view
- Casts `account_type::TEXT` to resolve the type mismatch
- Safe to run - uses `CREATE OR REPLACE`

**How to run:**
1. Open Supabase SQL Editor
2. Copy and paste the entire contents of `FIX_ACCOUNT_TYPE_TYPE_MISMATCH.sql`
3. Click "Run"

**Expected result:**
- ✅ View updated successfully
- ✅ Error should be resolved immediately
- ✅ RPC function `get_connection_degree_reviews` should now work

---

### **STEP 2: Migration (For Proper Tracking)**
**File:** `supabase/migrations/20250316000000_create_connection_degree_reviews_system.sql`

**What it does:**
- Creates the complete connection degree reviews system
- Includes the fix for account_type type mismatch
- Properly tracked in migration history
- Creates all necessary functions and views

**When to run:**
- ✅ If you haven't created the system yet, run this
- ✅ If you want proper migration tracking, run this after Step 1
- ⚠️ Safe to run even if Step 1 was already run (uses CREATE OR REPLACE)

**How to run:**
```bash
# Option A: Using Supabase CLI
supabase migration up

# Option B: Manual in SQL Editor
# Copy and paste the entire migration file content
```

---

## 🧪 **Verification After Running**

### Test 1: Check if view works
```sql
SELECT * FROM public.reviews_with_connection_degree LIMIT 5;
```

### Test 2: Test the RPC function (replace with your user_id)
```sql
SELECT * FROM public.get_connection_degree_reviews(
  'YOUR_USER_ID_HERE'::uuid, 
  20, 
  0
);
```

### Test 3: Verify account_type is TEXT
```sql
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reviews_with_connection_degree'
  AND column_name = 'reviewer_account_type';
-- Should show: data_type = 'text'
```

---

## 📋 **Summary**

**Minimum Required:** Just run **STEP 1** (`FIX_ACCOUNT_TYPE_TYPE_MISMATCH.sql`) to fix the immediate error.

**Recommended:** Run both steps:
1. **STEP 1** - Quick fix (immediate resolution)
2. **STEP 2** - Migration (proper tracking and complete system)

Both files are safe to run multiple times (they use `CREATE OR REPLACE`).

---

## ⚠️ **If You Get Errors**

### Error: "function is_event_relevant_to_user does not exist"
**Solution:** Run the migration file (STEP 2) which creates this function, OR run the original `CREATE_CONNECTION_DEGREE_REVIEWS_SYSTEM.sql` first.

### Error: "relation 'public.reviews' does not exist"
**Solution:** Your database uses different table names. Check with `verify_table_names.sql` and update the view accordingly.

### Error: "function get_connection_degree does not exist"
**Solution:** You need to create the connection degree functions first. These should exist from `SIMPLIFIED_LINKEDIN_CONNECTIONS.sql` or similar.

