# Database Normalization Guide

## What These Migrations Do

### Migration 1: Drop Unused Tables
**File:** `supabase/migrations/20250131000000_drop_unused_tables.sql`

- Drops `events` table (old unused table)
- Drops `artist_profile` table (unused duplicate of `artists` table)

### Migration 2: Normalize jambase_events Connections
**File:** `supabase/migrations/20250131000001_normalize_jambase_events_uuids.sql`

This migration:
1. Ensures `artist_uuid` column exists in `jambase_events` (foreign key to `artists.id`)
2. Ensures `venue_uuid` column exists in `jambase_events` (foreign key to `venues.id`)
3. Populates these UUIDs by matching:
   - `artist_name` from events → `name` in artists table
   - `venue_name` from events → `name` in venues table
   - Also tries `artist_id` → `jambase_artist_id` if that exists
   - Also tries `venue_id` → `jambase_venue_id` if that exists
4. Shows you a report of how many events were connected

## How to Apply

1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste Migration 1 SQL, run it
3. Copy and paste Migration 2 SQL, run it
4. Check the results in the console/logs

## What This Achieves

**Before:**
- `jambase_events` had artist/venue names stored as TEXT
- No proper foreign key relationships
- `artist_uuid` and `venue_uuid` were mostly NULL

**After:**
- `jambase_events.artist_uuid` → properly links to `artists.id`
- `jambase_events.venue_uuid` → properly links to `venues.id`
- You can now JOIN these tables properly in queries
- The app can now properly navigate from an event to artist/venue details

## Verification Queries

After running the migrations, run these to verify:

```sql
-- Check how many events have proper links
SELECT 
  COUNT(*) as total_events,
  COUNT(artist_uuid) as events_with_artist,
  COUNT(venue_uuid) as events_with_venue,
  ROUND(COUNT(artist_uuid) * 100.0 / COUNT(*), 2) as artist_link_percentage,
  ROUND(COUNT(venue_uuid) * 100.0 / COUNT(*), 2) as venue_link_percentage
FROM jambase_events;

-- Test a proper JOIN query
SELECT 
  je.title,
  je.event_date,
  a.name as artist_name,
  a.image_url as artist_image,
  v.name as venue_name,
  v.city as venue_city
FROM jambase_events je
LEFT JOIN artists a ON je.artist_uuid = a.id
LEFT JOIN venues v ON je.venue_uuid = v.id
LIMIT 10;
```

## Important Notes

- The migration keeps the original `artist_id` (TEXT) and `venue_id` (TEXT) columns for JamBase API compatibility
- The new `artist_uuid` and `venue_uuid` columns are the ones you should use for joins
- `artist_name` and `venue_name` are kept as denormalized data for quick queries without joins
- This follows 3NF normalization while keeping performance by denormalizing names

