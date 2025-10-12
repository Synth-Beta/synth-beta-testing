# Fix Database Error for New User Signups

## The Problem
The code is trying to access new onboarding fields (`onboarding_completed`, `onboarding_skipped`, `tour_completed`, `location_city`) that don't exist in your database yet. This causes new user signups to fail.

## The Solution
You need to apply the onboarding migrations to your Supabase database.

## Quick Fix Steps

### Option 1: Apply via Supabase Dashboard (Recommended)
1. Go to your Supabase Dashboard → SQL Editor
2. Open and run `APPLY_ONBOARDING_MIGRATIONS.sql`
3. Wait for it to complete (should take a few seconds)
4. Try signing up a new user again - it should work!

### Option 2: Check First, Then Apply
1. Go to Supabase Dashboard → SQL Editor
2. Run `CHECK_ONBOARDING_FIELDS.sql` to verify if fields are missing
3. If it returns 0 rows, run `APPLY_ONBOARDING_MIGRATIONS.sql`
4. Run the check again - should now return 4 rows

## What This Adds

### Profiles Table Fields
- `onboarding_completed` - Tracks if user finished onboarding
- `onboarding_skipped` - Tracks if user skipped onboarding
- `tour_completed` - Tracks if user finished the app tour
- `location_city` - User's city for local event discovery

### New Tables
- `user_music_tags` - Stores user music preferences (genres/artists)
- `account_upgrade_requests` - Tracks requests to upgrade account type

## After Applying
Once you run the SQL, new users will be able to sign up without errors and will see the onboarding flow after email confirmation.

## Notes
- All new fields have safe defaults (false for booleans, null for text)
- Existing users are not affected
- The migrations use `IF NOT EXISTS` so they're safe to run multiple times

