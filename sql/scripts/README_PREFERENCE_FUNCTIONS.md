# Preference Tracking Functions - Complete Guide

## Overview
This directory contains SQL functions for tracking all 44 preference signals across the Synth application. Functions are grouped by domain for easier management.

## Files

### 1. `functions_artist_preferences.sql`
Artist-related preference tracking:
- `track_artist_follow()` - Follow artist (weight: 7.0)
- `track_artist_unfollow()` - Unfollow artist (weight: -2.0)
- `track_artist_search()` - Search for artist (weight: 2.0)
- `track_artist_review()` - Review artist (weight: 8.0, scaled by rating)

### 2. `functions_event_preferences.sql`
Event-related preference tracking:
- `track_event_interest()` - Mark event as interested/remove (weight: 5.0/-2.0)
- `track_event_attendance()` - Mark attendance/remove (weight: 10.0/-3.0)
- `track_event_review()` - Create/update/delete review (weight: 8.0/6.0/-4.0)
- `track_event_search()` - Search for event (weight: 2.0)
- `track_event_ticket_click()` - Click ticket link (weight: 4.0)

### 3. `functions_venue_preferences.sql`
Venue-related preference tracking:
- `track_venue_follow()` - Follow venue (weight: 7.0)
- `track_venue_unfollow()` - Unfollow venue (weight: -2.0)
- `track_venue_review()` - Review venue (weight: 8.0, scaled by rating)
- `track_venue_search()` - Search for venue (weight: 2.0)

### 4. `functions_streaming_preferences.sql`
Streaming-related preference tracking:
- `track_streaming_spotify_connected()` - Connect Spotify (weight: 3.0)
- `track_streaming_apple_music_connected()` - Connect Apple Music (weight: 3.0)
- `track_streaming_profile_synced()` - Sync genre data (weight: count/10, max 6.0)
- `track_streaming_top_track()` - Top track (weight: 4.0/5.0/6.0 by time_range)
- `track_streaming_top_artist()` - Top artist (weight: 4.0/5.0/6.0 by time_range)
- `track_streaming_recent_play()` - Recently played (weight: 3.0)
- `track_streaming_setlist_add()` - Add to setlist (weight: 4.0)

### 5. `functions_genre_preferences.sql`
Genre-related preference tracking:
- `track_genre_search()` - Search for genre (weight: 2.0)
- `track_genre_manual_preference()` - Manual genre preference (weight: 9.0)
- `track_artist_manual_preference()` - Manual artist preference (weight: 9.0)
- `track_venue_manual_preference()` - Manual venue preference (weight: 9.0)

### 6. `functions_review_content_preferences.sql`
Review content preference tracking:
- `track_review_rating_overall()` - Overall rating (weight: 1-5)
- `track_review_category_rating()` - Category rating (weight: 0.5-5.0)
- `track_review_reaction_emoji()` - Reaction emoji (weight: 2.0)
- `track_review_genre_tags()` - Genre tags (weight: 3.0 per tag)
- `track_review_mood_tags()` - Mood tags (weight: 2.0 per tag)
- `track_review_context_tags()` - Context tags (weight: 2.0 per tag)
- `track_review_photos()` - Photos (weight: 1.0 per photo, max 5.0)
- `track_review_videos()` - Videos (weight: 2.0 per video, max 6.0)

## Installation

Run all function files in order:

```sql
\i sql/scripts/functions_artist_preferences.sql
\i sql/scripts/functions_event_preferences.sql
\i sql/scripts/functions_venue_preferences.sql
\i sql/scripts/functions_streaming_preferences.sql
\i sql/scripts/functions_genre_preferences.sql
\i sql/scripts/functions_review_content_preferences.sql
```

Or run them in any order - they're independent.

## Usage Examples

### Artist Follow
```sql
SELECT track_artist_follow(
  'user-uuid',
  'artist-uuid',  -- or NULL
  'Artist Name',  -- or NULL
  'jambase-id'    -- or NULL
);
```

### Event Interest
```sql
SELECT track_event_interest(
  'user-uuid',
  'event-uuid',
  true  -- is_interested
);
```

### Event Attendance
```sql
SELECT track_event_attendance(
  'user-uuid',
  'event-uuid',
  true  -- was_there
);
```

### Event Review
```sql
SELECT track_event_review(
  'user-uuid',
  'review-uuid',
  'event-uuid',
  4.5,  -- rating
  'created'  -- action
);
```

### Streaming Top Artist
```sql
SELECT track_streaming_top_artist(
  'user-uuid',
  'artist-uuid',  -- or NULL
  'Artist Name',
  'spotify-id',
  'long_term',  -- time_range
  ARRAY['rock', 'pop'],  -- genres
  'spotify'
);
```

### Review Category Rating
```sql
SELECT track_review_category_rating(
  'user-uuid',
  'review-uuid',
  'event-uuid',
  'artist_performance',  -- category
  4.5  -- rating
);
```

### Review Genre Tags
```sql
SELECT track_review_genre_tags(
  'user-uuid',
  'review-uuid',
  'event-uuid',
  ARRAY['rock', 'indie', 'pop']  -- genre tags
);
```

## Features

### Automatic Genre Extraction
- Functions automatically extract genres from artists/events
- Creates normalized signals (one row per genre)
- Handles missing genres gracefully

### Entity Resolution
- Functions resolve entity IDs from names when needed
- Fallback to provided names if entity not found
- Handles both UUID and external IDs (Spotify, JamBase)

### Weight Calculation
- Appropriate weights for each signal type
- Rating-based scaling for reviews
- Negative weights for removal signals

### Auto-Computation
- All signals trigger automatic preference computation
- `user_preferences` table updated automatically via triggers
- No manual computation needed

## Integration Points

### Frontend Components

**Artist Interactions:**
- `src/components/artists/ArtistFollowButton.tsx` → `track_artist_follow()` / `track_artist_unfollow()`
- `src/components/ArtistSearchBox.tsx` → `track_artist_search()`

**Event Interactions:**
- `src/components/events/EventDetailsModal.tsx` → `track_event_interest()`, `track_event_attendance()`, `track_event_ticket_click()`
- `src/services/userEventService.ts` → `track_event_interest()`, `track_event_attendance()`
- `src/services/reviewService.ts` → `track_event_review()`, all review content functions

**Venue Interactions:**
- `src/components/venues/VenueFollowButton.tsx` → `track_venue_follow()` / `track_venue_unfollow()`

**Streaming:**
- `src/services/spotifyService.ts` → All streaming functions
- `src/services/appleMusicService.ts` → Streaming connection functions

**Search:**
- `src/components/search/RedesignedSearchPage.tsx` → Search tracking functions

## Notes

- All functions use `SECURITY DEFINER` for proper permissions
- Functions handle NULL values gracefully
- Genre signals are normalized (one row per genre)
- Conflicts are handled with `ON CONFLICT DO NOTHING`
- All functions return signal ID(s) for tracking

