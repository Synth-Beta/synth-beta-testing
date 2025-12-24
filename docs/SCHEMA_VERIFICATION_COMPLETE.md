# Schema Verification Complete

## Source of Truth Schemas Received

All three table schemas have been provided and verified:

### ✅ Events Table
- **Primary Key**: `id` (UUID)
- **Unique Constraint**: `jambase_event_id` (TEXT) - **Perfect for upsert**
- **Foreign Keys**:
  - `artist_jambase_id` (UUID) → `artists.id`
  - `venue_jambase_id` (UUID) → `venues.id`
- **Sync Column**: `last_modified_at` (TIMESTAMPTZ) - **Ready for incremental sync**
- **Indexes**: All required indexes exist, including `idx_events_last_modified_at`

### ✅ Artists Table
- **Primary Key**: `id` (UUID)
- **Unique Constraints**:
  - `jambase_artist_id` (TEXT) - **Perfect for upsert**
  - `identifier` (TEXT)
- **Indexes**: All required indexes exist for efficient lookups

### ✅ Venues Table
- **Primary Key**: `id` (UUID)
- **Unique Constraint**: `jambase_venue_id` (TEXT) - **Perfect for upsert**
- **Indexes**: All required indexes exist for efficient lookups

## Upsert Strategy Confirmed

### Foreign Key Challenge
Since `events.artist_jambase_id` and `events.venue_jambase_id` are UUIDs (FKs), we must:
1. **First**: Upsert artists → get UUIDs
2. **Second**: Upsert venues → get UUIDs
3. **Third**: Upsert events with FK UUIDs

### Optimized Batch Process
For each page of events (100 events):
1. Extract all unique artists → dedupe by `jambase_artist_id`
2. Batch upsert artists → get UUID mapping: `{jambase_artist_id: uuid}`
3. Extract all unique venues → dedupe by `jambase_venue_id`
4. Batch upsert venues → get UUID mapping: `{jambase_venue_id: uuid}`
5. Map events with FK UUIDs → batch upsert events

**Result**: 3 database operations per page (artists, venues, events)

## Schema Optimization Status

✅ **All tables optimized for sync**:
- Unique constraints on Jambase IDs (enables efficient upserts)
- Proper indexes for lookups
- Foreign key constraints properly configured
- `last_modified_at` column ready for incremental sync

## Next Steps

Proceed to Phase 2: Build Optimized Sync Plan

