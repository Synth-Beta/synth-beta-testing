# Relationship Table Consolidation - Execution Order

## Overview
Consolidates relationship tables into three focused tables:
1. **`follows`** - All follow types (artists, venues, users)
2. **`user_relationships`** - User-to-user relationships (friend, match, block)
3. **`relationships`** - Event interests only (going, maybe, interest, not_going)

## Execution Order

Run these SQL files in this exact order:

### Step 1: Create New Tables
```sql
-- Create follows table
\i supabase/migrations/consolidation/create_follows_table.sql

-- Create user_relationships table  
\i supabase/migrations/consolidation/create_user_relationships_table.sql
```

### Step 2: Migrate Data
```sql
-- Migrate data to new tables (includes backup and migration)
\i supabase/migrations/consolidation/migrate_to_new_relationship_tables.sql
```

### Step 3: Update Relationships for Events Only
```sql
-- Recreate relationships table for events only
\i supabase/migrations/consolidation/update_relationships_for_events.sql
```

### Step 4: Migrate Event Interests
```sql
-- Migrate event interests to new relationships table
-- (This is included in migrate_to_new_relationship_tables.sql)
```

### Step 5: Drop Unused Tables
```sql
-- Drop old tables that have been consolidated
\i supabase/migrations/consolidation/drop_unused_tables.sql
```

## Alternative: Run Complete Script

Or run the complete script (which handles all steps in order):
```sql
\i supabase/migrations/consolidation/consolidate_relationship_tables_complete.sql
```

## Tables Being Dropped

After migration completes, these tables will be dropped:

### Relationship Tables:
- `friends` → Consolidated into `user_relationships`
- `friend_requests` → Consolidated into `user_relationships`
- `matches` → Consolidated into `user_relationships`
- `user_swipes` → No longer needed (matching now in `user_relationships`)

### Follow Tables:
- `artist_follows` → Consolidated into `follows`
- `venue_follows` → Consolidated into `follows`

### Event Interest Tables:
- `user_jambase_events` → Consolidated into `relationships`
- `event_interests` → Consolidated into `relationships`

### Genre Interaction Tables:
- `user_genre_interactions` → Consolidated into `user_genre_preferences`

## New Table Structure

### `follows`
- `user_id` → User doing the following
- `followed_entity_type` → 'artist', 'venue', or 'user'
- `followed_entity_id` → UUID of entity being followed
- Tracks: Artist follows, venue follows, user follows

### `user_relationships`
- `user_id` → Primary user
- `related_user_id` → Other user in relationship
- `relationship_type` → 'friend', 'match', or 'block'
- `status` → 'pending', 'accepted', 'declined' (for friends)
- Tracks: Friendships, matches, blocks

### `relationships` (updated)
- `user_id` → User with interest
- `related_entity_type` → Always 'event'
- `related_entity_id` → Event UUID
- `relationship_type` → 'going', 'maybe', 'interest', 'not_going'
- Tracks: Event interests only

## Verification

After running the migration, verify data was migrated correctly:

```sql
-- Check follows count
SELECT COUNT(*) FROM follows;

-- Check user_relationships count
SELECT COUNT(*) FROM user_relationships;

-- Check relationships (event interests) count
SELECT COUNT(*) FROM relationships WHERE related_entity_type = 'event';
```

