# Phase 1: Table Verification & Schema Preparation

## Overview
Phase 1 ensures that the database tables (`events`, `artists`, `venues`) are properly set up to receive data from the Jambase API sync, and creates the infrastructure to track sync state.

## Files Created

### 1. Schema Verification Script
**File**: `sql/verify_table_schemas.sql`

This script verifies that:
- All required tables exist (`events`, `artists`, `venues`)
- Required columns are present:
  - `events.jambase_event_id` (TEXT, unique)
  - `events.artist_jambase_id` (UUID, FK to `artists.id`)
  - `events.venue_jambase_id` (UUID, FK to `venues.id`)
  - `artists.jambase_artist_id` (TEXT, unique)
  - `venues.jambase_venue_id` (TEXT, unique)
- Required indexes exist for performance
- Foreign key constraints are properly set up

**Usage**:
```bash
# Run via Supabase CLI or psql
psql $DATABASE_URL -f sql/verify_table_schemas.sql
```

The script will output:
- ✅ Success messages for existing components
- ⚠️ Warnings for missing components
- Detailed column and constraint listings

### 2. Add last_modified_at Column Migration
**File**: `supabase/migrations/20250125000001_add_last_modified_at_to_events.sql`

Adds the `last_modified_at` column to the `events` table to track when each event was last modified in Jambase:
- `last_modified_at` (TIMESTAMPTZ) - Stores the `dateModified` value from Jambase API
- Index on `last_modified_at` for efficient incremental sync queries

**Features**:
- Index on `last_modified_at DESC` for efficient queries
- Used for incremental sync (query events modified since last sync)
- Populated from Jambase API's `dateModified` field

**Usage**:
```bash
# Apply via Supabase CLI
supabase migration up

# Or run directly
psql $DATABASE_URL -f supabase/migrations/20250125000001_add_last_modified_at_to_events.sql
```

**Note**: This replaces the `sync_state` table approach. We now use `MAX(last_modified_at)` from events table to determine the last sync time.

## Verification Checklist

Before proceeding to Phase 2, verify:

- [ ] `events` table exists with:
  - [ ] `jambase_event_id` column (TEXT, unique)
  - [ ] `artist_jambase_id` column (UUID, FK to `artists.id`)
  - [ ] `venue_jambase_id` column (UUID, FK to `venues.id`)
  - [ ] Index on `jambase_event_id`
  - [ ] Foreign key constraints to `artists` and `venues`

- [ ] `artists` table exists with:
  - [ ] `jambase_artist_id` column (TEXT, unique)
  - [ ] Index on `jambase_artist_id`
  - [ ] Unique constraint on `jambase_artist_id`

- [ ] `venues` table exists with:
  - [ ] `jambase_venue_id` column (TEXT, unique)
  - [ ] Index on `jambase_venue_id`

- [ ] `events.last_modified_at` column exists:
  - [ ] `last_modified_at` column (TIMESTAMPTZ)
  - [ ] Index on `last_modified_at DESC`
  - [ ] Used for incremental sync tracking

## Next Steps

Once Phase 1 verification is complete:
1. Review any warnings from the verification scripts
2. Fix any missing columns, indexes, or constraints
3. Proceed to Phase 2: Remove Frontend API Access

## Troubleshooting

### If tables don't match expected schema:
1. Check existing migrations in `supabase/migrations/`
2. Compare with the provided schema in the plan
3. Create additional migrations if needed to align schemas

### If foreign keys are missing:
- Foreign keys are critical for data integrity
- They ensure events reference valid artists/venues
- Add them before running the sync

### If sync_state table creation fails:
- Check RLS policies don't conflict
- Ensure service_role has proper permissions
- Verify migration timestamp doesn't conflict with existing migrations

