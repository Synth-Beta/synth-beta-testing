-- ============================================
-- PASSPORT ENHANCEMENT MIGRATIONS - EXECUTION ORDER
-- ============================================
-- Run these SQL files in Supabase SQL Editor in the exact order listed
-- Copy and paste each file's contents in sequence

-- ============================================
-- STEP 1: Schema Enhancements
-- ============================================
-- File: supabase/migrations/20250128000000_enhance_passport_entries.sql
\i supabase/migrations/20250128000000_enhance_passport_entries.sql

-- ============================================
-- STEP 2: New Tables
-- ============================================
-- File: supabase/migrations/20250128000001_create_passport_identity.sql
\i supabase/migrations/20250128000001_create_passport_identity.sql

-- File: supabase/migrations/20250128000002_create_passport_timeline.sql
\i supabase/migrations/20250128000002_create_passport_timeline.sql

-- File: supabase/migrations/20250128000003_create_passport_taste_map.sql
\i supabase/migrations/20250128000003_create_passport_taste_map.sql

-- File: supabase/migrations/20250128000004_create_passport_achievements.sql
\i supabase/migrations/20250128000004_create_passport_achievements.sql

-- ============================================
-- STEP 3: Calculation Functions
-- ============================================
-- File: supabase/migrations/20250128000005_calculate_fan_type.sql
\i supabase/migrations/20250128000005_calculate_fan_type.sql

-- File: supabase/migrations/20250128000006_calculate_home_scene.sql
\i supabase/migrations/20250128000006_calculate_home_scene.sql

-- ============================================
-- STEP 4: Detection Functions
-- ============================================
-- File: supabase/migrations/20250128000007_detect_passport_eras.sql
\i supabase/migrations/20250128000007_detect_passport_eras.sql

-- File: supabase/migrations/20250128000008_detect_passport_festivals.sql
\i supabase/migrations/20250128000008_detect_passport_festivals.sql

-- File: supabase/migrations/20250128000009_calculate_artist_milestones.sql
\i supabase/migrations/20250128000009_calculate_artist_milestones.sql

-- ============================================
-- STEP 5: Preference & Achievement Functions
-- ============================================
-- File: supabase/migrations/20250128000010_calculate_taste_map.sql
\i supabase/migrations/20250128000010_calculate_taste_map.sql

-- File: supabase/migrations/20250128000011_detect_passport_achievements.sql
\i supabase/migrations/20250128000011_detect_passport_achievements.sql

-- ============================================
-- STEP 6: Trigger Enhancements
-- ============================================
-- File: supabase/migrations/20250128000012_enhance_passport_triggers.sql
\i supabase/migrations/20250128000012_enhance_passport_triggers.sql

-- ============================================
-- STEP 7: Periodic Calculations
-- ============================================
-- File: supabase/migrations/20250128000013_passport_periodic_calculations.sql
\i supabase/migrations/20250128000013_passport_periodic_calculations.sql

-- ============================================
-- STEP 8: Backfill (Run Last!)
-- ============================================
-- File: supabase/migrations/20250128000014_backfill_passport_enhancements.sql
-- NOTE: This can take a while depending on user count
\i supabase/migrations/20250128000014_backfill_passport_enhancements.sql

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify tables exist
SELECT 'Tables created:' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'passport%'
ORDER BY table_name;

-- Verify functions exist
SELECT 'Functions created:' as status;
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND (routine_name LIKE '%passport%' OR routine_name LIKE '%fan_type%' OR routine_name LIKE '%taste_map%' 
     OR routine_name LIKE '%achievement%' OR routine_name LIKE '%era%' OR routine_name LIKE '%festival%')
ORDER BY routine_name;

-- Verify passport_entries enhancements
SELECT 'Passport entries enhanced:' as status;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'passport_entries'
AND column_name IN ('rarity', 'cultural_context')
ORDER BY column_name;

-- Check sample passport identity
SELECT 'Sample passport identity:' as status;
SELECT user_id, fan_type, join_year, calculated_at 
FROM passport_identity 
LIMIT 5;

