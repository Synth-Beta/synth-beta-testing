# Spotify Genre Preference Signals - Migration Instructions

## What Was Done

1. **New migration: `20250210000005_create_streaming_profiles_staging.sql`**
   - Creates `streaming_profiles` table (staging table for raw Spotify/Apple Music API data)
   - Documented as intentionally non-3NF - raw JSONB staging; normalized data goes to `user_preference_signals`
   - Includes RLS and FK

2. **Updated: `20260202000001_spotify_genre_preference_signals.sql`**
   - Removed streaming_profiles table creation (moved to staging migration)
   - Added conditional trigger - only attaches if `streaming_profiles` exists
   - Keeps: enum value, function, conditional trigger

## Steps to Apply

### Option A: Fresh migration (recommended)

1. Run migrations in Supabase:
   ```bash
   npx supabase db push
   ```
   Or in Supabase Dashboard: SQL Editor → run migrations in order.

2. Migrations run in order by timestamp:
   - `20250210000005` creates `streaming_profiles`
   - `20250210000006` attaches existing music capture trigger
   - `20260202000001` adds spotify_genre enum, function, and our trigger

### Option B: If you previously got "streaming_profiles does not exist"

1. Apply migrations. The new `20250210000005` will create the table.
2. If `20260202000001` already partially ran (e.g. enum added but trigger failed), re-run it - the migration is idempotent and will complete.

### Option C: Manual SQL (Supabase Dashboard)

1. Run `20250210000005_create_streaming_profiles_staging.sql` first
2. Run `20260202000001_spotify_genre_preference_signals.sql` second

## Verification

After migrations run successfully:

1. **Check table exists:**
   ```sql
   SELECT 1 FROM information_schema.tables WHERE table_name = 'streaming_profiles';
   ```

2. **Check trigger exists:**
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgname = 'trigger_process_spotify_genres_to_signals';
   ```

3. **Test flow:** Connect Spotify in the app → sync runs → `streaming_profiles` gets data → trigger fires → `user_preference_signals` gets genre rows with `signal_type = 'spotify_genre'`
