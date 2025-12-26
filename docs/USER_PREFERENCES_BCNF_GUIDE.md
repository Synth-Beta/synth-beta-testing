# User Preferences System - BCNF Schema Guide

## Overview

The user preferences system has been redesigned in **Boyce-Codd Normal Form (BCNF)** to explicitly track music preferences for building personalized feeds. The schema separates:

1. **Signals** (fact table) - Individual preference signals
2. **Preferences** (aggregated) - Computed preference scores
3. **Settings** (configuration) - User settings separate from preferences

## Schema Structure

### 1. `user_preference_signals` (Fact Table)
One row per preference signal. This is the source of truth for all music preference data.

**Key Columns:**
- `user_id` - User who generated the signal
- `signal_type` - Type of signal (enum: 44 music preference signals)
- `entity_type` - Type of entity (artist, event, venue, song, genre, review)
- `entity_id` - UUID of the entity (if applicable)
- `entity_name` - Denormalized name for faster queries
- `signal_weight` - Strength of preference (0-10+)
- `genre` - Extracted genre (one row per genre if multiple)
- `context` - Additional metadata (JSONB)
- `occurred_at` - When the signal occurred

**Example:**
```sql
-- User follows an artist
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre
) VALUES (
  'user-uuid', 'artist_follow', 'artist', 'artist-uuid', 'The Beatles', 7.0, 'rock'
);
```

### 2. `user_preferences` (Aggregated Table)
One row per user. Computed from `user_preference_signals`.

**Key Columns:**
- `user_id` - User ID (unique)
- `genre_preference_scores` - JSONB: `{"rock": 8.5, "jazz": 6.2}`
- `artist_preference_scores` - JSONB: `{"uuid-1": 9.0, "uuid-2": 7.5}`
- `venue_preference_scores` - JSONB: `{"uuid-1": 8.0}`
- `top_genres` - Array of top 20 genres (ordered by score)
- `top_artists` - Array of top 50 artists (ordered by score)
- `top_venues` - Array of top 30 venues (ordered by score)
- `signal_count` - Total number of signals
- `last_computed_at` - When preferences were last computed

**Auto-computed:** Preferences are automatically computed when signals are inserted (via trigger).

### 3. `user_settings` (Settings Table)
User settings separate from preferences.

**Key Columns:**
- `user_id` - User ID (unique)
- `notification_preferences` - JSONB notification settings
- `email_preferences` - JSONB email settings
- `privacy_settings` - JSONB privacy settings

## Signal Types (44 Total)

### Artist Signals (4)
- `artist_follow` - User follows artist (weight: 7.0)
- `artist_unfollow` - User unfollows artist (weight: -2.0)
- `artist_search` - User searches for artist (weight: 2.0)
- `artist_review` - User reviews artist (weight: 8.0)

### Event Signals (9)
- `event_interest` - User marks event as interested (weight: 5.0)
- `event_interest_removed` - User removes interest (weight: -2.0)
- `event_attendance` - User marks attendance (weight: 10.0)
- `event_attendance_removed` - User removes attendance (weight: -3.0)
- `event_review_created` - User creates review (weight: 8.0)
- `event_review_updated` - User updates review (weight: 6.0)
- `event_review_deleted` - User deletes review (weight: -4.0)
- `event_search` - User searches for event (weight: 2.0)
- `event_ticket_click` - User clicks ticket link (weight: 4.0)

### Venue Signals (4)
- `venue_follow` - User follows venue (weight: 7.0)
- `venue_unfollow` - User unfollows venue (weight: -2.0)
- `venue_review` - User reviews venue (weight: 8.0)
- `venue_search` - User searches for venue (weight: 2.0)

### Streaming Signals (11)
- `streaming_spotify_connected` - User connects Spotify
- `streaming_apple_music_connected` - User connects Apple Music
- `streaming_profile_synced` - User syncs profile
- `streaming_top_track_short` - Top track (4 weeks) (weight: 4.0)
- `streaming_top_track_medium` - Top track (6 months) (weight: 5.0)
- `streaming_top_track_long` - Top track (all time) (weight: 6.0)
- `streaming_top_artist_short` - Top artist (4 weeks) (weight: 4.0)
- `streaming_top_artist_medium` - Top artist (6 months) (weight: 5.0)
- `streaming_top_artist_long` - Top artist (all time) (weight: 6.0)
- `streaming_recent_play` - Recently played song (weight: 3.0)
- `streaming_setlist_add` - User adds song to setlist (weight: 4.0)

### Genre Signals (4)
- `genre_search` - User searches for genre (weight: 2.0)
- `genre_manual_preference` - User manually sets genre preference (weight: 9.0)
- `artist_manual_preference` - User manually sets artist preference (weight: 9.0)
- `venue_manual_preference` - User manually sets venue preference (weight: 9.0)

### Review Content Signals (12)
- `review_rating_overall` - Overall rating (1-5 stars)
- `review_rating_artist_performance` - Artist performance rating
- `review_rating_production` - Production rating
- `review_rating_venue` - Venue rating
- `review_rating_location` - Location rating
- `review_rating_value` - Value rating
- `review_reaction_emoji` - Reaction emoji
- `review_genre_tags` - Genre tags added
- `review_mood_tags` - Mood tags added
- `review_context_tags` - Context tags added
- `review_photos` - Photos uploaded
- `review_videos` - Videos uploaded

## Usage Examples

### Inserting Signals

#### Using Helper Functions (Recommended)

```sql
-- Artist follow
SELECT insert_artist_follow_signal(
  'user-uuid',
  'artist-uuid',
  'The Beatles',
  ARRAY['rock', 'pop']
);

-- Event interest
SELECT insert_event_interest_signal(
  'user-uuid',
  'event-uuid',
  'Concert at Red Rocks',
  ARRAY['rock', 'indie'],
  true  -- is_interested
);

-- Event attendance
SELECT insert_event_attendance_signal(
  'user-uuid',
  'event-uuid',
  'Concert at Red Rocks',
  ARRAY['rock', 'indie'],
  true  -- was_there
);

-- Review
SELECT insert_review_signal(
  'user-uuid',
  'review-uuid',
  'event-uuid',
  'Concert at Red Rocks',
  4.5,  -- rating
  ARRAY['rock', 'indie'],
  'created'  -- action
);

-- Streaming top track
SELECT insert_streaming_signal(
  'user-uuid',
  'streaming_top_track_long',
  'song',
  'song-uuid',
  'Song Name',
  ARRAY['rock'],
  'long_term',
  NULL  -- weight (will use default)
);

-- Search
SELECT insert_search_signal(
  'user-uuid',
  'artist',
  'The Beatles',
  ARRAY['rock', 'pop']
);
```

#### Direct Insert

```sql
-- Direct insert (if helper functions don't cover your use case)
INSERT INTO user_preference_signals (
  user_id, signal_type, entity_type, entity_id, entity_name, 
  signal_weight, genre, context
) VALUES (
  'user-uuid',
  'artist_follow',
  'artist',
  'artist-uuid',
  'The Beatles',
  7.0,
  'rock',
  jsonb_build_object('source', 'mobile_app')
);
```

### Querying Preferences

#### Get User's Top Genres

```sql
SELECT top_genres
FROM user_preferences
WHERE user_id = 'user-uuid';
```

#### Get User's Genre Scores

```sql
SELECT 
  genre,
  score::numeric
FROM user_preferences,
  jsonb_each_text(genre_preference_scores) AS genre_data(genre, score)
WHERE user_id = 'user-uuid'
ORDER BY score::numeric DESC;
```

#### Get User's Top Artists

```sql
SELECT 
  a.id,
  a.name,
  (up.artist_preference_scores->>a.id::text)::numeric as score
FROM user_preferences up
CROSS JOIN LATERAL unnest(top_artists) AS artist_id
JOIN artists a ON a.id = artist_id
WHERE up.user_id = 'user-uuid'
ORDER BY score DESC;
```

#### Get All Signals for a User

```sql
SELECT 
  signal_type,
  entity_type,
  entity_name,
  signal_weight,
  genre,
  occurred_at
FROM user_preference_signals
WHERE user_id = 'user-uuid'
ORDER BY occurred_at DESC;
```

### Computing Preferences

Preferences are automatically computed when signals are inserted (via trigger). To manually recompute:

```sql
SELECT compute_user_preferences('user-uuid');
```

To recompute for all users:

```sql
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN 
    SELECT DISTINCT user_id FROM user_preference_signals
  LOOP
    PERFORM compute_user_preferences(user_record.user_id);
  END LOOP;
END $$;
```

## Building Personalized Feeds

### Example: Get Personalized Events

```sql
-- Get events matching user's top genres
SELECT e.*
FROM events e
CROSS JOIN LATERAL unnest(e.genres) AS event_genre
JOIN user_preferences up ON up.user_id = 'user-uuid'
WHERE event_genre = ANY(up.top_genres)
  AND e.event_date >= now()
ORDER BY 
  -- Boost events with user's top genres
  CASE WHEN event_genre = ANY(up.top_genres[1:5]) THEN 1 ELSE 2 END,
  e.event_date ASC
LIMIT 50;
```

### Example: Get Personalized Artists

```sql
-- Get artists matching user's preferences
SELECT a.*
FROM artists a
JOIN user_preferences up ON up.user_id = 'user-uuid'
WHERE a.id = ANY(up.top_artists)
   OR EXISTS (
     SELECT 1 
     FROM unnest(a.genres) AS artist_genre
     WHERE artist_genre = ANY(up.top_genres)
   )
ORDER BY 
  -- Prioritize followed artists
  CASE WHEN a.id = ANY(up.top_artists[1:10]) THEN 1 ELSE 2 END;
```

## Migration

To migrate from the old schema:

1. Run `create_user_preferences_bcnf.sql` to create new tables
2. Run `migrate_user_preferences_to_bcnf.sql` to migrate data
3. Update application code to use new schema
4. (Optional) Drop old `user_preferences` table after verification

## Best Practices

1. **Use helper functions** - They handle weights and normalization automatically
2. **Extract genres** - Always extract genres from entities when inserting signals
3. **Normalize genres** - One signal row per genre (not arrays)
4. **Use appropriate weights** - Follow the weight guidelines for signal types
5. **Query preferences, not signals** - Use `user_preferences` for feed building (faster)
6. **Recompute periodically** - Preferences auto-compute, but you can manually recompute if needed

## Performance Considerations

- **Indexes** - All key columns are indexed for fast queries
- **GIN indexes** - JSONB columns use GIN indexes for fast lookups
- **Materialized views** - Consider materialized views for complex feed queries
- **Caching** - Cache computed preferences in application layer if needed

## Signal Weight Guidelines

| Signal Type | Weight | Reason |
|------------|--------|--------|
| `event_attendance` | 10.0 | Strongest signal - user actually attended |
| `event_review_created` | 8.0 | Strong signal - user took time to review |
| `artist_follow` | 7.0 | Strong signal - explicit interest |
| `event_interest` | 5.0 | Medium signal - intent to attend |
| `streaming_top_track_long` | 6.0 | Strong signal - long-term listening |
| `streaming_recent_play` | 3.0 | Weak signal - recent activity |
| `event_search` | 2.0 | Weak signal - exploratory |
| `artist_unfollow` | -2.0 | Negative signal - disinterest |
| `event_attendance_removed` | -3.0 | Strong negative signal |

Negative weights reduce preference scores, indicating disinterest.

