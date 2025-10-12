# Database Query Fixes

## Issues Fixed

### 1. ❌ Ambiguous `user_id` Column Reference in Event Photos
**Error:** `column reference "user_id" is ambiguous`

**Location:** `get_event_photos` SQL function

**Problem:** 
The function was querying the `event_photo_likes` table without qualifying the `user_id` column. Since both `event_photos` and `event_photo_likes` tables have a `user_id` column, PostgreSQL couldn't determine which one was referenced.

**Fix:**
Added table alias qualification to the ambiguous column:
```sql
-- BEFORE (line 517)
WHERE photo_id = ep.id AND user_id = auth.uid()

-- AFTER (line 36 in fix)
WHERE epl.photo_id = ep.id AND epl.user_id = auth.uid()
```

### 2. ❌ Invalid PostgREST Relationship Syntax in Matching Service
**Error:** `Could not find a relationship between 'user_jambase_events' and 'user_id' in the schema cache`

**Location:** `src/services/matchingService.ts` line 142

**Problem:**
The query was using incorrect PostgREST syntax by trying to reference a relationship with just a column name (`profiles:user_id`), when it should use the foreign key constraint name.

**Fix:**
Updated to use the correct foreign key relationship syntax:
```typescript
// BEFORE
profiles:user_id (
  user_id,
  name,
  ...
)

// AFTER
profiles!user_jambase_events_user_id_fkey (
  user_id,
  name,
  ...
)
```

## How to Apply

### Step 1: Fix SQL Function
Run the SQL fix to update the database function:

```bash
# Option 1: Through Supabase Dashboard
# Go to SQL Editor → paste contents of fix_event_photos_function.sql → Run

# Option 2: Using psql
psql your_database_url < fix_event_photos_function.sql
```

### Step 2: Restart Dev Server
The TypeScript fix is already applied. Just restart your dev server:

```bash
# Stop the current server (Ctrl+C)
# Restart
npm run dev
```

## Verification

After applying the fixes, these features should work correctly:

1. ✅ **Event Photo Gallery** - Photos load with correct like status
2. ✅ **Concert Buddy Swiper** - Potential matches load properly
3. ✅ **User Profiles** - Profile data loads in match queries

## Related Files

- **SQL Fix:** `fix_event_photos_function.sql`
- **TypeScript Fix:** `src/services/matchingService.ts` (already applied)
- **Original Migration:** `supabase/migrations/20250216000000_phase4_social_engagement.sql`

## Technical Details

### Foreign Key Constraint Names
When using PostgREST's embedded resources syntax, you need to reference the actual foreign key constraint name:

```typescript
// Format: foreign_table!source_table_column_fkey
profiles!user_jambase_events_user_id_fkey (...)
```

To find constraint names:
```sql
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'user_jambase_events';
```

### SQL Ambiguity Resolution
When multiple tables in a query have the same column name, always use:
- Table aliases for clarity
- Fully qualified column names (alias.column_name)

```sql
-- Good
SELECT ep.user_id, epl.user_id
FROM event_photos ep
JOIN event_photo_likes epl ON epl.photo_id = ep.id

-- Bad (ambiguous)
SELECT user_id, user_id
FROM event_photos
JOIN event_photo_likes ON photo_id = id
```

## Status
✅ Both fixes applied and ready to test

