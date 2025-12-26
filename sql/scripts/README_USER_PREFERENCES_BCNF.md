# User Preferences BCNF Migration

## Overview

The `user_preferences` table has been redesigned in **BCNF (Boyce-Codd Normal Form)** to explicitly track music preferences for building personalized feeds.

## What Changed

### Old Schema (Denormalized)
- Single table with arrays (`preferred_genres[]`, `preferred_artists[]`)
- JSONB blobs for preference data
- Mixed concerns (preferences + settings + cache)

### New Schema (BCNF Normalized)
- **`user_preference_signals`** - Fact table (one row per signal)
- **`user_preferences`** - Aggregated preferences (one row per user, computed)
- **`user_settings`** - Settings separated from preferences

## Files Created

1. **`create_user_preferences_bcnf.sql`** - Creates new BCNF schema
   - Creates enums for signal types and entity types
   - Creates `user_preference_signals` table (fact table)
   - Creates `user_preferences` table (aggregated)
   - Creates `user_settings` table (settings)
   - Creates RLS policies
   - Creates triggers for auto-computation
   - Creates `compute_user_preferences()` function

2. **`migrate_user_preferences_to_bcnf.sql`** - Migrates existing data
   - Migrates `preferred_genres[]` to signals
   - Migrates `preferred_artists[]` to signals
   - Migrates `preferred_venues[]` to signals
   - Migrates JSONB preference data to signals
   - Migrates settings to `user_settings` table
   - Computes preferences for all users

3. **`helper_functions_user_preferences.sql`** - Helper functions
   - `insert_artist_follow_signal()` - Insert artist follow
   - `insert_event_interest_signal()` - Insert event interest
   - `insert_event_attendance_signal()` - Insert event attendance
   - `insert_review_signal()` - Insert review signal
   - `insert_streaming_signal()` - Insert streaming signal
   - `insert_search_signal()` - Insert search signal

4. **`docs/USER_PREFERENCES_BCNF_GUIDE.md`** - Complete documentation
   - Schema explanation
   - All 44 signal types
   - Usage examples
   - Query examples
   - Best practices

## Installation Steps

1. **Create new schema:**
   ```sql
   \i sql/scripts/create_user_preferences_bcnf.sql
   ```

2. **Migrate existing data (if applicable):**
   ```sql
   \i sql/scripts/migrate_user_preferences_to_bcnf.sql
   ```

3. **Create helper functions:**
   ```sql
   \i sql/scripts/helper_functions_user_preferences.sql
   ```

## Key Features

### 1. Explicit Signal Tracking
All 44 music preference signals are explicitly tracked:
- Artist: follow, unfollow, search, review
- Event: interest, attendance, review, search, ticket click
- Venue: follow, unfollow, review, search
- Streaming: connect, sync, top tracks/artists, recent plays
- Genre: search, manual preferences
- Review content: ratings, tags, media

### 2. Normalized Genre Tracking
- One row per genre (not arrays)
- Genres extracted from entities automatically
- Fast genre-based queries

### 3. Weighted Signals
- Each signal has a weight (0-10+)
- Higher weight = stronger preference
- Negative weights for disinterest signals

### 4. Auto-Computation
- Preferences automatically computed when signals inserted
- Can manually recompute with `compute_user_preferences()`

### 5. Fast Feed Building
- Pre-computed preference scores in `user_preferences`
- Top genres, artists, venues arrays for quick access
- Optimized indexes for feed queries

## Usage Example

```sql
-- Insert artist follow signal
SELECT insert_artist_follow_signal(
  'user-uuid',
  'artist-uuid',
  'The Beatles',
  ARRAY['rock', 'pop']
);

-- Get user's top genres
SELECT top_genres FROM user_preferences WHERE user_id = 'user-uuid';

-- Get personalized events
SELECT e.*
FROM events e
JOIN user_preferences up ON up.user_id = 'user-uuid'
WHERE e.genres && up.top_genres
ORDER BY e.event_date ASC;
```

## Benefits

1. **BCNF Normalized** - No redundancy, proper normalization
2. **Explicit Tracking** - All 44 signals explicitly tracked
3. **Fast Queries** - Pre-computed preferences for feed building
4. **Scalable** - Can handle millions of signals efficiently
5. **Flexible** - Easy to add new signal types
6. **Maintainable** - Clear separation of concerns

## Next Steps

1. Update application code to use new schema
2. Update triggers/functions that insert preference data
3. Test feed building queries
4. Monitor performance
5. (Optional) Drop old `user_preferences` table after verification

## Support

See `docs/USER_PREFERENCES_BCNF_GUIDE.md` for complete documentation.

