# Migration Steps for Connection Label Updates

## Overview
This migration updates all connection degree labels across the entire site to use simplified naming:
- **Degree 1**: `Friend` (was "Friends")
- **Degree 2**: `Mutual Friend` (was "Friends of Friends" / "Mutual Friends")
- **Degree 3**: `Mutual Friends +` (was "Extended Network" / "Mutual Friends of Mutual Friends")
- **Degree 0/4+**: `Stranger` (was "Community" / "Strangers")

## Step-by-Step Instructions

### Step 1: Verify Current State (Optional)
Run this to see current connection labels in your database:
```sql
SELECT DISTINCT connection_label, COUNT(*) 
FROM public.user_recommendations_cache 
GROUP BY connection_label;
```

### Step 2: Run Migration 1 - Update Existing Data
**File**: `supabase/migrations/20251112000001_update_community_to_stranger.sql`

This updates:
- Existing records in `user_recommendations_cache` table
- Drops and recreates the CHECK constraint with new values

**Run this in Supabase SQL Editor**

### Step 3: Run Migration 2 - Update get_connection_info Function
**File**: `supabase/migrations/20251112000002_update_connection_labels_to_simplified.sql`

This updates:
- The `get_connection_info()` function to return new simplified labels
- This function is used throughout the frontend to display connection badges

**Run this in Supabase SQL Editor**

### Step 4: Verify the Updates
Run these queries to verify everything is working:

```sql
-- Check updated cache records
SELECT connection_label, COUNT(*) 
FROM public.user_recommendations_cache 
GROUP BY connection_label
ORDER BY connection_label;

-- Test the get_connection_info function
SELECT * FROM public.get_connection_info(
  'YOUR_USER_ID_HERE'::uuid,
  'ANOTHER_USER_ID_HERE'::uuid
);
```

### Step 5: Recalculate Recommendations (Optional)
If you want to refresh recommendations with new labels:
```sql
SELECT public.calculate_user_recommendations('YOUR_USER_ID_HERE'::uuid);
```

## Files to Run (in order)

1. ✅ `supabase/migrations/20251112000001_update_community_to_stranger.sql`
2. ✅ `supabase/migrations/20251112000002_update_connection_labels_to_simplified.sql`

**Note**: The main migration file `20251112000000_create_user_recommendation_system.sql` should already be applied. If not, run it first.

## Frontend Changes
The frontend code has already been updated. After running the migrations:
- Refresh your browser
- The new labels will automatically appear from the updated `get_connection_info()` function
- All connection badges throughout the site will show the new simplified labels

## Rollback (if needed)
If you need to rollback, you can revert the function:
```sql
-- Revert to old labels (if needed)
CREATE OR REPLACE FUNCTION public.get_connection_info(current_user_id UUID, target_user_id UUID)
RETURNS TABLE(...)
AS $$
  -- Use old CASE statement with 'Friends', 'Friends of Friends', etc.
$$;
```

