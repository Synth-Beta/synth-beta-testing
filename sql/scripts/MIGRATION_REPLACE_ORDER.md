# User Preferences Migration - Single Script Replacement

## Overview
This migration completely replaces the old `user_preferences` table with the new BCNF-normalized schema **without losing any data**.

## What It Does
1. ✅ Backs up old table to `user_preferences_backup`
2. ✅ Creates new BCNF schema tables
3. ✅ Migrates ALL data from old table to new schema
4. ✅ Computes aggregated preferences
5. ✅ Drops old table and replaces it with new schema
6. ✅ Sets up RLS policies and triggers

## Execution

### Single File to Run:
```
sql/scripts/migrate_and_replace_user_preferences.sql
```

**That's it!** Just run this one file and it handles everything.

## What Gets Migrated

### From old table to new schema:
- ✅ `preferred_genres[]` → `user_preference_signals` (genre_manual_preference)
- ✅ `preferred_artists[]` → `user_preference_signals` (artist_manual_preference)
- ✅ `preferred_venues[]` → `user_preference_signals` (venue_manual_preference)
- ✅ `streaming_stats` JSONB → `user_preference_signals` (streaming signals)
- ✅ `music_preference_signals` JSONB → `user_preference_signals` (all signals)
- ✅ `genre_preferences` JSONB → `user_preference_signals` (preference signals)
- ✅ `notification_preferences` → `user_settings`
- ✅ `email_preferences` → `user_settings`
- ✅ `privacy_settings` → `user_settings`

### New Tables Created:
- `user_preference_signals` - Fact table (one row per signal)
- `user_preferences` - Aggregated preferences (computed from signals)
- `user_settings` - User settings (separated from preferences)
- `user_preferences_backup` - Backup of old table (can be dropped later)

## Verification

After migration, verify with:

```sql
-- Check backup
SELECT COUNT(*) FROM user_preferences_backup;

-- Check signals
SELECT COUNT(*) FROM user_preference_signals;

-- Check preferences
SELECT COUNT(*) FROM user_preferences;

-- Check settings
SELECT COUNT(*) FROM user_settings;

-- Sample preference data
SELECT 
  user_id,
  jsonb_object_keys(genre_preference_scores) as genres,
  array_length(top_genres, 1) as top_genres_count,
  array_length(top_artists, 1) as top_artists_count
FROM user_preferences
LIMIT 5;
```

## Rollback (if needed)

If you need to rollback:

```sql
-- Restore from backup
CREATE TABLE public.user_preferences AS SELECT * FROM public.user_preferences_backup;

-- Then drop new tables if needed
DROP TABLE IF EXISTS user_preference_signals CASCADE;
DROP TABLE IF EXISTS user_preferences_new CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
```

**Note:** The backup table `user_preferences_backup` is kept for safety. You can drop it after verifying everything works.

## Expected Output

You should see:
```
=== STARTING COMPLETE USER_PREFERENCES MIGRATION ===
Step 1: Creating backup of old user_preferences table...
✅ Backed up X rows to user_preferences_backup
Step 2: Creating new BCNF schema...
✅ New BCNF schema tables created
Step 3: Migrating data from backup to new schema...
✅ Data migrated to new schema
Step 4: Creating compute function and computing preferences...
Computing preferences for X users...
✅ Computed preferences for X users
Step 5: Replacing old table with new schema...
✅ Old table replaced with new schema and RLS configured
=== MIGRATION COMPLETE ===
```

## Time Estimate
- Small datasets (< 100 users): ~1-2 minutes
- Medium datasets (100-1000 users): ~3-5 minutes
- Large datasets (1000+ users): ~5-15 minutes

## Next Steps After Migration

1. ✅ Verify data (use queries above)
2. ✅ Test feed building with new schema
3. ✅ Update application code to use new schema
4. ✅ (Optional) Drop `user_preferences_backup` after verification

