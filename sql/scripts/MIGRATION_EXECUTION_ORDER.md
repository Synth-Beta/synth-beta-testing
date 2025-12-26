# User Preferences BCNF Migration - Execution Order

## Overview
This guide provides the exact order to run SQL scripts to migrate from the old `user_preferences` table to the new BCNF-normalized schema.

## Prerequisites
- Access to your Supabase database
- Ability to run SQL migrations
- Backup of your database (recommended)

## Execution Order

### Step 1: Create New Schema
**File:** `sql/scripts/create_user_preferences_bcnf.sql`

```sql
\i sql/scripts/create_user_preferences_bcnf.sql
```

**What it does:**
- Creates enums for signal types and entity types
- Creates `user_preference_signals` table (fact table)
- Creates `user_preferences` table (aggregated)
- Creates `user_settings` table (settings)
- Sets up RLS policies
- Creates triggers and functions

**Expected output:** No errors, tables created successfully

---

### Step 2: Create Helper Functions
**File:** `sql/scripts/helper_functions_user_preferences.sql`

```sql
\i sql/scripts/helper_functions_user_preferences.sql
```

**What it does:**
- Creates helper functions for inserting signals
- Functions like `insert_artist_follow_signal()`, `insert_event_interest_signal()`, etc.

**Expected output:** Functions created successfully

---

### Step 3: Migrate Existing Data
**File:** `sql/scripts/migrate_existing_user_preferences_data.sql`

```sql
\i sql/scripts/migrate_existing_user_preferences_data.sql
```

**What it does:**
- Migrates `preferred_genres[]` → signals
- Migrates `preferred_artists[]` → signals
- Migrates `preferred_venues[]` → signals
- Migrates `streaming_stats` JSONB → signals
- Migrates `music_preference_signals` JSONB → signals
- Migrates `genre_preferences` JSONB → signals
- Migrates settings → `user_settings` table
- Computes preferences for all users

**Expected output:**
- Progress messages for each migration step
- Summary with counts of migrated data
- Final message: "MIGRATION COMPLETE"

**Time:** May take a few minutes depending on data volume

---

## Verification Queries

After migration, run these to verify:

### Check Signals Count
```sql
SELECT COUNT(*) as total_signals FROM user_preference_signals;
```

### Check Preferences Count
```sql
SELECT COUNT(*) as total_preferences FROM user_preferences;
```

### Check Settings Count
```sql
SELECT COUNT(*) as total_settings FROM user_settings;
```

### Check Sample User Preferences
```sql
SELECT 
  user_id,
  jsonb_object_keys(genre_preference_scores) as genres,
  array_length(top_genres, 1) as top_genres_count,
  array_length(top_artists, 1) as top_artists_count,
  signal_count
FROM user_preferences
LIMIT 5;
```

### Check Sample Signals
```sql
SELECT 
  user_id,
  signal_type,
  entity_type,
  entity_name,
  signal_weight,
  genre,
  occurred_at
FROM user_preference_signals
ORDER BY occurred_at DESC
LIMIT 10;
```

---

## Troubleshooting

### If you get enum errors:
The enums might already exist. The script handles this with `IF NOT EXISTS`, but if you get errors, you can drop and recreate:
```sql
DROP TYPE IF EXISTS preference_signal_type CASCADE;
DROP TYPE IF EXISTS preference_entity_type CASCADE;
```
Then re-run Step 1.

### If you get constraint errors:
Check for duplicate data:
```sql
SELECT user_id, signal_type, entity_type, entity_id, occurred_at, COUNT(*)
FROM user_preference_signals
GROUP BY user_id, signal_type, entity_type, entity_id, occurred_at
HAVING COUNT(*) > 1;
```

### If preferences aren't computing:
Manually compute for a user:
```sql
SELECT compute_user_preferences('user-uuid-here');
```

---

## Rollback (if needed)

If you need to rollback, you can drop the new tables:

```sql
DROP TABLE IF EXISTS user_preference_signals CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TYPE IF EXISTS preference_signal_type CASCADE;
DROP TYPE IF EXISTS preference_entity_type CASCADE;
```

**Note:** This will delete all migrated data. Make sure you have a backup!

---

## Next Steps After Migration

1. **Update Application Code**
   - Update code that reads from old `user_preferences` table
   - Use new `user_preference_signals` for inserting signals
   - Use new `user_preferences` for reading aggregated preferences
   - Use new `user_settings` for settings

2. **Test Feed Building**
   - Test personalized feed queries using new schema
   - Verify preference scores are correct

3. **Monitor Performance**
   - Check query performance
   - Monitor signal insertion performance

4. **Optional: Drop Old Table**
   - After verification, you can drop the old `user_preferences` table:
   ```sql
   -- Only do this after thorough testing!
   -- DROP TABLE IF EXISTS user_preferences_old CASCADE;
   ```

---

## Summary

**Run in this order:**
1. ✅ `create_user_preferences_bcnf.sql`
2. ✅ `helper_functions_user_preferences.sql`
3. ✅ `migrate_existing_user_preferences_data.sql`

**Total execution time:** ~5-15 minutes depending on data volume

**Files created:**
- `user_preference_signals` (fact table)
- `user_preferences` (aggregated)
- `user_settings` (settings)

**Data migrated:**
- All preference data from old schema
- All settings data
- All computed preferences

