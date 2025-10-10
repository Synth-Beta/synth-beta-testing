# Artist Follow System Implementation Guide

## Overview

This document describes the complete artist following system that allows users to follow artists and receive notifications when artists have new events or profile updates.

## Database Architecture

### Tables

#### `artist_follows`
Tracks which users follow which artists using a presence-based model (row exists = following).

```sql
- id: UUID (primary key)
- user_id: UUID (references auth.users)
- artist_id: UUID (references artists table)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP (optional, auto-managed)
- UNIQUE(user_id, artist_id)
```

### Views

#### `artist_follows_with_details`
Denormalized view for easy querying with artist and user information:
- All fields from artist_follows
- artist_name, artist_image_url, jambase_artist_id
- num_upcoming_events, genres (from artist_profile)
- user_name, user_avatar_url (from profiles)

### Functions

#### `set_artist_follow(p_artist_id UUID, p_following BOOLEAN)`
Security definer function to safely toggle follow status without RLS issues.
- If `p_following = true`: Inserts follow record (idempotent)
- If `p_following = false`: Deletes follow record

#### `get_artist_follower_count(p_artist_id UUID)`
Returns the number of users following a given artist.

#### `is_following_artist(p_artist_id UUID, p_user_id UUID)`
Checks if a specific user is following a specific artist.

### Triggers & Notifications

#### New Event Notifications
When a new event is inserted into `jambase_events`:
- Trigger: `trigger_notify_followers_new_event`
- Function: `notify_artist_followers_new_event()`
- Creates notification type: `artist_new_event`
- Notifies all followers of the artist

#### Profile Update Notifications
When an artist profile is updated:
- Triggers on both `artists` and `artist_profile` tables
- Function: `notify_artist_followers_profile_update()`
- Creates notification type: `artist_profile_updated`
- Only notifies on significant changes (name, image, events, genres)

## Frontend Implementation

### Services

#### `artistFollowService.ts`
Main service for artist follow operations:

**Key Methods:**
- `setArtistFollow(userId, artistId, following)` - Toggle follow status
- `isFollowingArtist(artistId, userId)` - Check follow status
- `getFollowerCount(artistId)` - Get follower count
- `getArtistFollowStats(artistId, userId)` - Get both count and follow status
- `getUserFollowedArtists(userId)` - Get all artists a user follows
- `getArtistFollowers(artistId)` - Get all followers of an artist
- `getArtistUuidByJambaseId(jambaseId)` - Resolve artist UUID
- `getArtistUuidByName(name)` - Resolve artist UUID by name
- `subscribeToArtistFollows(userId, callback)` - Real-time updates

### Components

#### `ArtistFollowButton.tsx`
Reusable follow button component with:
- Automatic artist UUID resolution (from jambaseId or name)
- Real-time follow status updates
- Follower count display (optional)
- Loading states
- Toast notifications
- Multiple size and variant options

**Props:**
```typescript
{
  artistId?: string;           // Artist UUID (preferred)
  artistName?: string;          // Artist name (fallback)
  jambaseArtistId?: string;    // JamBase ID (fallback)
  userId: string;               // Current user ID
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showFollowerCount?: boolean;  // Show follower count
  className?: string;
  onFollowChange?: (isFollowing: boolean) => void;
}
```

### Integration Points

#### 1. Artist Card (`ArtistCard.tsx`)
- Follow button in header next to artist name
- Shows follower count
- Full-width button style

#### 2. Review Card (`ReviewCard.tsx`)
- Small follow button next to artist name chip
- Ghost variant for subtle integration
- Compact size

#### 3. Unified Feed (TODO)
- Follow button on artist badges in review cards
- Follow button on event cards showing artist names

#### 4. Search Results (TODO)
- Follow button on artist search results
- Follow button on artist profile previews

## Notification Types

### `artist_new_event`
Sent when an artist has a new event added.

**Data Structure:**
```json
{
  "artist_id": "uuid",
  "artist_name": "Artist Name",
  "event_id": "uuid",
  "event_title": "Event Title",
  "venue_name": "Venue Name",
  "event_date": "2025-01-15T19:00:00Z"
}
```

### `artist_profile_updated`
Sent when significant artist profile fields change.

**Data Structure:**
```json
{
  "artist_id": "uuid",
  "artist_name": "Artist Name",
  "changes": ["name", "image", "new_events", "genres"]
}
```

### `artist_followed`
(Optional) Could be sent when a user starts following an artist.

## Migration Files

### Main Migration: `20250110000001_create_artist_follows_system.sql`

This comprehensive migration includes:
1. Table creation/renaming (user_artists → artist_follows)
2. RLS policies
3. Indexes for performance
4. Toggle function with security definer
5. Notification type extensions
6. Trigger functions for event and profile notifications
7. Views for easy querying
8. Helper functions for follower count and status checks

## Usage Examples

### Frontend - Following an Artist

```typescript
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';

// In your component
<ArtistFollowButton
  artistId={artist.id}
  userId={currentUserId}
  showFollowerCount={true}
  onFollowChange={(isFollowing) => {
    console.log('Follow status changed:', isFollowing);
  }}
/>
```

### Frontend - Getting Followed Artists

```typescript
import { ArtistFollowService } from '@/services/artistFollowService';

const followedArtists = await ArtistFollowService.getUserFollowedArtists(userId);
console.log('User follows:', followedArtists);
```

### Frontend - Real-time Updates

```typescript
const channel = ArtistFollowService.subscribeToArtistFollows(
  userId,
  (follow, event) => {
    if (event === 'INSERT') {
      console.log('Started following:', follow.artist_id);
    } else {
      console.log('Stopped following:', follow.artist_id);
    }
  }
);

// Cleanup
return () => channel.unsubscribe();
```

### Database - Manual Queries

```sql
-- Get all followers of an artist
SELECT * FROM artist_follows_with_details
WHERE artist_id = 'artist-uuid-here';

-- Get all artists a user follows
SELECT * FROM artist_follows_with_details
WHERE user_id = 'user-uuid-here';

-- Check if user follows artist
SELECT is_following_artist('artist-uuid', 'user-uuid');

-- Get follower count
SELECT get_artist_follower_count('artist-uuid');
```

## Testing Checklist

- [ ] Run the migration on your Supabase instance
- [ ] Verify artist_follows table exists with proper schema
- [ ] Test following an artist from ArtistCard
- [ ] Test unfollowing an artist
- [ ] Verify follower count updates in real-time
- [ ] Test following from ReviewCard
- [ ] Add a new event for an artist and verify notifications
- [ ] Update an artist profile and verify notifications
- [ ] Test with both `artists` and `artist_profile` tables
- [ ] Verify RLS policies work correctly
- [ ] Test real-time subscription updates

## Performance Considerations

### Indexes Created
- `idx_artist_follows_user_id` - Fast user lookup
- `idx_artist_follows_artist_id` - Fast artist lookup
- `idx_artist_follows_created_at` - Chronological queries

### Optimizations
- Presence-based model (no boolean column)
- Security definer functions to avoid RLS overhead
- Denormalized view for common queries
- Proper foreign key constraints for data integrity

## Troubleshooting

### Artist UUID Not Found
The follow button automatically resolves artist UUIDs from:
1. Direct artist UUID (preferred)
2. JamBase artist ID
3. Artist name (case-insensitive search)

If none resolve, the button won't render.

### Notifications Not Sending
Check:
1. Artist exists in `artists` or `artist_profile` table
2. Triggers are enabled on `jambase_events`, `artists`, and `artist_profile`
3. User has followed the artist before the event/update
4. Notification constraints allow the new notification types

### Follow Not Persisting
Verify:
1. RLS policies are correctly configured
2. User is authenticated
3. Artist ID is valid UUID
4. `set_artist_follow` function has proper permissions

## Future Enhancements

- [ ] Batch notification settings (digest emails)
- [ ] Follow artist from search results
- [ ] Follow suggestions based on music taste
- [ ] Artist recommendation algorithm
- [ ] Export followed artists list
- [ ] Share followed artists with friends
- [ ] Notification preferences per artist
- [ ] Artist activity feed (all updates in one place)
- [ ] Integration with email notifications
- [ ] Analytics: most followed artists, trending artists

