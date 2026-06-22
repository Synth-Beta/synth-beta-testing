# Passport Enhancement Migration Order

This document lists all SQL migration files that need to be run in order for the Passport Enhancement feature.

## Execution Order

Run these migrations in Supabase SQL Editor in the exact order listed below:

### 1. Schema Enhancements (Foundation)
```sql
-- File: 20250128000000_enhance_passport_entries.sql
-- Extends passport_entries table with new types, rarity, and cultural_context
-- Must run first as it modifies the base table structure
```

### 2. New Tables (Identity & Tracking)
```sql
-- File: 20250128000001_create_passport_identity.sql
-- Creates passport_identity table for fan type, home scene, and join year
```

```sql
-- File: 20250128000002_create_passport_timeline.sql
-- Creates passport_timeline table for pinned and auto-selected highlights
```

```sql
-- File: 20250128000003_create_passport_taste_map.sql
-- Creates passport_taste_map table for calculated taste preferences
```

```sql
-- File: 20250128000004_create_passport_achievements.sql
-- Creates passport_achievements table for behavioral achievements
```

### 3. Calculation Functions (Core Logic)
```sql
-- File: 20250128000005_calculate_fan_type.sql
-- Creates calculate_fan_type_archetype and update_passport_identity functions
-- Required by identity table operations
```

```sql
-- File: 20250128000006_calculate_home_scene.sql
-- Creates calculate_home_scene and update_home_scene functions
-- Requires passport_identity table and scenes table
```

### 4. Detection Functions (Stamp Generation)
```sql
-- File: 20250128000007_detect_passport_eras.sql
-- Creates detect_user_eras function for era stamp generation
-- Requires enhanced passport_entries table
```

```sql
-- File: 20250128000008_detect_passport_festivals.sql
-- Creates detect_festival_stamps function with keyword matching
-- Requires enhanced passport_entries table
```

```sql
-- File: 20250128000009_calculate_artist_milestones.sql
-- Creates calculate_artist_milestones function
-- Requires enhanced passport_entries table
```

### 5. Preference & Achievement Functions
```sql
-- File: 20250128000010_calculate_taste_map.sql
-- Creates calculate_taste_map function
-- Requires passport_taste_map table and user_genre_preferences table
```

```sql
-- File: 20250128000011_detect_passport_achievements.sql
-- Creates achievement detection functions:
--   - detect_first_time_city
--   - detect_deep_cut_reviewer
--   - detect_scene_connector
--   - detect_trusted_taste
-- Requires passport_achievements table
```

### 6. Trigger Enhancements
```sql
-- File: 20250128000012_enhance_passport_triggers.sql
-- Updates auto_unlock_passport_on_review trigger to detect festivals, milestones, achievements
-- Creates auto_select_timeline_highlights function
-- Must run after all detection functions are created
```

### 7. Periodic Calculations
```sql
-- File: 20250128000013_passport_periodic_calculations.sql
-- Creates master recalculation functions:
--   - recalculate_passport_data (for single user)
--   - recalculate_all_passport_data (batch for all users)
-- Requires all previous functions
```

### 8. Backfill (Data Population)
```sql
-- File: 20250128000014_backfill_passport_enhancements.sql
-- Backfills passport data for existing users:
--   - Calculates fan types and identities
--   - Detects festivals and milestones
--   - Detects eras (for users with 10+ events)
--   - Calculates taste maps
--   - Detects achievements
-- MUST RUN LAST - requires all tables and functions
```

### 9. Schema Fixes (CRITICAL)
```sql
-- File: 20250128000015_fix_passport_functions_schema.sql
-- Fixes functions to use proper joins with artists and venues tables
-- Fixes references to non-existent columns (venue_name, artist_name on events table)
-- MUST RUN AFTER all other migrations - fixes schema mismatches
```

## Quick Reference: All Files in Order (Click to Open)

1. [20250128000000_enhance_passport_entries.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000000_enhance_passport_entries.sql)
2. [20250128000001_create_passport_identity.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000001_create_passport_identity.sql)
3. [20250128000002_create_passport_timeline.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000002_create_passport_timeline.sql)
4. [20250128000003_create_passport_taste_map.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000003_create_passport_taste_map.sql)
5. [20250128000004_create_passport_achievements.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000004_create_passport_achievements.sql)
6. [20250128000005_calculate_fan_type.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000005_calculate_fan_type.sql)
7. [20250128000006_calculate_home_scene.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000006_calculate_home_scene.sql)
8. [20250128000007_detect_passport_eras.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000007_detect_passport_eras.sql)
9. [20250128000008_detect_passport_festivals.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000008_detect_passport_festivals.sql)
10. [20250128000009_calculate_artist_milestones.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000009_calculate_artist_milestones.sql)
11. [20250128000010_calculate_taste_map.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000010_calculate_taste_map.sql)
12. [20250128000011_detect_passport_achievements.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000011_detect_passport_achievements.sql)
13. [20250128000012_enhance_passport_triggers.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000012_enhance_passport_triggers.sql)
14. [20250128000013_passport_periodic_calculations.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000013_passport_periodic_calculations.sql)
15. [20250128000014_backfill_passport_enhancements.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000014_backfill_passport_enhancements.sql)

16. [20250128000015_fix_passport_functions_schema.sql](/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/supabase/migrations/20250128000015_fix_passport_functions_schema.sql) ⚠️ **REQUIRED FIX**

## Important Notes

- **Do NOT skip any migrations** - they build on each other
- The backfill script (last file) can take a while depending on user count
- All migrations are idempotent where possible (use IF NOT EXISTS, DROP IF EXISTS)
- Run migrations during low-traffic periods if possible
- Monitor execution time for the backfill script - it processes users in batches

## Verification

After running all migrations, verify:

1. Check that all tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name LIKE 'passport%'
   ORDER BY table_name;
   ```

2. Check that key functions exist:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_schema = 'public'
   AND routine_name LIKE '%passport%' OR routine_name LIKE '%fan_type%' OR routine_name LIKE '%taste_map%'
   ORDER BY routine_name;
   ```

3. Verify passport_entries has new columns:
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'passport_entries'
   AND column_name IN ('rarity', 'cultural_context');
   ```

## Troubleshooting

If a migration fails:
1. Check the error message - it will indicate which dependency is missing
2. Verify that previous migrations ran successfully
3. Check that the existing passport system exists (from `20251223000000_create_passport_system.sql`)
4. Ensure you have proper permissions (should run as postgres or database owner)

