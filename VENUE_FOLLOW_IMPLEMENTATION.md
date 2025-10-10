# Venue Follow System - Complete Implementation

## 🎯 Overview

A complete venue following system that mirrors the artist follow functionality but uses **NAME-BASED matching** instead of IDs. Users can follow venues by name, receive notifications when those venues have new events, and view all upcoming events at followed venues.

## 🗄️ Database Architecture

### Main Table: `venue_follows`

```sql
CREATE TABLE venue_follows (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  venue_name TEXT NOT NULL,
  venue_city TEXT,
  venue_state TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, venue_name, venue_city, venue_state)
);
```

**Key Design Decisions:**
- Uses venue **NAME** instead of venue ID
- Includes `venue_city` and `venue_state` for disambiguation
- Presence-based model: Row exists = following, no row = not following
- Unique constraint on `(user_id, venue_name, venue_city, venue_state)`

### Why Name-Based Matching?

Unlike artists which have JamBase IDs, venues in your system may not have consistent IDs. Name-based matching with city/state provides:
- **Flexibility**: Works even if venue IDs change
- **User-Friendly**: Users follow venues by the name they see
- **Resilience**: No dependency on external ID systems
- **Disambiguation**: City/state prevents duplicate venue names from conflicting

## 📡 Database Functions

### 1. Toggle Follow Status
```sql
SELECT set_venue_follow(
  'The Fillmore',  -- venue name
  'San Francisco', -- city (optional)
  'CA',           -- state (optional)
  true            -- follow or unfollow
);
```

### 2. Check If Following
```sql
SELECT is_following_venue(
  'The Fillmore',
  'San Francisco',
  'CA',
  'user-uuid'
);
-- Returns: true/false
```

### 3. Get Follower Count
```sql
SELECT get_venue_follower_count(
  'The Fillmore',
  'San Francisco',
  'CA'
);
-- Returns: integer count
```

### 4. Get All Followed Venues
```sql
SELECT * FROM venue_follows_with_details
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC;
```

## 🔔 Notification System

### New Event at Followed Venue

**Trigger:** When INSERT on `jambase_events` table

**Matching Logic:**
```sql
WHERE venue_name ILIKE NEW.venue_name
  AND (venue_city IS NULL OR venue_city ILIKE NEW.venue_city)
  AND (venue_state IS NULL OR venue_state ILIKE NEW.venue_state)
```

**Notification Created:**
- Type: `venue_new_event`
- Title: "{Venue Name} has a new event!"
- Message: "{Event Title} on {Date}"
- Data: venue info, event details

## 🎨 Frontend Implementation

### TypeScript Types (`src/types/venueFollow.ts`)

```typescript
interface VenueFollow {
  id: string;
  user_id: string;
  venue_name: string;
  venue_city?: string;
  venue_state?: string;
  created_at: string;
  updated_at: string;
}

interface VenueFollowWithDetails extends VenueFollow {
  user_name?: string;
  user_avatar_url?: string;
}

interface VenueFollowStats {
  follower_count: number;
  is_following: boolean;
}
```

### Service Layer (`src/services/venueFollowService.ts`)

**Key Methods:**
```typescript
// Follow/unfollow by name
VenueFollowService.setVenueFollowByName(
  userId,
  venueName,
  venueCity?,
  venueState?,
  following
)

// Check if following
VenueFollowService.isFollowingVenueByName(
  venueName,
  venueCity,
  venueState,
  userId
)

// Get follower count
VenueFollowService.getFollowerCountByName(
  venueName,
  venueCity?,
  venueState?
)

// Get all followed venues
VenueFollowService.getUserFollowedVenues(userId)

// Real-time subscriptions
VenueFollowService.subscribeToVenueFollows(userId, callback)
```

### UI Component (`src/components/venues/VenueFollowButton.tsx`)

**Props:**
```typescript
{
  venueName: string;        // Required
  venueCity?: string;       // Optional but recommended
  venueState?: string;      // Optional but recommended
  userId: string;           // Required
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showFollowerCount?: boolean;
  className?: string;
  onFollowChange?: (isFollowing: boolean) => void;
}
```

**Usage Example:**
```tsx
<VenueFollowButton
  venueName="The Fillmore"
  venueCity="San Francisco"
  venueState="CA"
  userId={currentUserId}
  variant="outline"
  size="default"
  showFollowerCount={true}
/>
```

## 📍 Integration Points

### 1. Venue Events Page
- **Location:** Header next to venue name
- **Style:** Large button with follower count
- **File:** `src/pages/VenueEvents.tsx`

### 2. Event Cards
- **Location:** Next to venue name in event details
- **Style:** Small ghost button
- **File:** `src/components/events/JamBaseEventCard.tsx`

### 3. Review Cards
- **Location:** Next to venue badge/chip
- **Style:** Compact button
- **File:** `src/components/reviews/ReviewCard.tsx`

### 4. Following Page
- **Location:** Dedicated "Venues" tab
- **Shows:** All followed venues with upcoming events
- **File:** `src/pages/ArtistFollowingPage.tsx`

## 🎯 Following Page Features

The following page now has **TWO TABS**:

### Artists Tab
- Shows all followed artists
- Lists upcoming events for each artist
- Click artist → see their details
- Pink theme

### Venues Tab
- Shows all followed venues
- Lists upcoming events at each venue
- Click venue → see venue details
- Blue theme

**Route:** `/following` (own) or `/following/:userId` (friend)

## ⚠️ Important: Name Matching Considerations

### 1. Case Insensitivity
All venue name comparisons use `ILIKE` (case-insensitive).

### 2. Location Specificity
Always pass city/state when possible to avoid ambiguity:
```typescript
// GOOD: Specific venue
<VenueFollowButton 
  venueName="The Fillmore"
  venueCity="San Francisco"
  venueState="CA"
/>

// OKAY: May match multiple venues
<VenueFollowButton 
  venueName="The Fillmore"
/>
```

### 3. Handling Duplicates
If multiple venues have the same name:
- Include city/state to disambiguate
- Users follow specific "The Fillmore, San Francisco, CA"
- Different from "The Fillmore, Denver, CO"

### 4. Name Normalization
The service automatically trims whitespace but preserves exact casing for storage.

## 🧪 Testing Guide

### 1. Test Following a Venue

```typescript
// In browser console or test file
await VenueFollowService.setVenueFollowByName(
  'user-uuid',
  'Red Rocks Amphitheatre',
  'Morrison',
  'CO',
  true
);
```

**Verify in SQL:**
```sql
SELECT * FROM venue_follows 
WHERE user_id = 'user-uuid' 
  AND venue_name ILIKE 'Red Rocks%';
```

### 2. Test Notification Trigger

```sql
-- Insert a new event
INSERT INTO jambase_events (
  jambase_event_id,
  title,
  artist_name,
  venue_name,
  venue_city,
  venue_state,
  event_date
) VALUES (
  'test-event-123',
  'Test Concert',
  'Test Artist',
  'Red Rocks Amphitheatre',
  'Morrison',
  'CO',
  '2025-06-15 19:00:00'
);

-- Check notifications created
SELECT * FROM notifications
WHERE type = 'venue_new_event'
  AND data->>'venue_name' ILIKE 'Red Rocks%'
ORDER BY created_at DESC;
```

### 3. Test UI Components

**Venue Events Page:**
1. Navigate to any venue page
2. See follow button in header
3. Click to follow
4. Verify button changes to "Following"
5. Check follower count increases

**Event Cards:**
1. Find event card with venue
2. See small follow button next to venue name
3. Click to follow
4. Verify button updates

**Following Page:**
1. Navigate to `/following`
2. Click "Venues" tab
3. See all followed venues
4. Click a venue → see its events
5. Verify event list displays

## 📊 Analytics Queries

### Most Followed Venues
```sql
SELECT 
  venue_name,
  venue_city,
  venue_state,
  COUNT(*) as follower_count
FROM venue_follows
GROUP BY venue_name, venue_city, venue_state
ORDER BY follower_count DESC
LIMIT 10;
```

### Users Following Most Venues
```sql
SELECT 
  user_id,
  COUNT(*) as venues_following
FROM venue_follows
GROUP BY user_id
ORDER BY venues_following DESC
LIMIT 10;
```

### Follow Activity Over Time
```sql
SELECT 
  DATE(created_at) as follow_date,
  COUNT(*) as follows_count
FROM venue_follows
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY follow_date DESC;
```

## 🐛 Troubleshooting

### Venue Not Matching
**Issue:** User follows venue but doesn't get notifications.

**Check:**
1. Verify exact venue name in database matches event venue name
2. Use `ILIKE` to check for case issues
3. Ensure city/state match if provided

```sql
-- Check venue names in your events
SELECT DISTINCT venue_name, venue_city, venue_state
FROM jambase_events
WHERE venue_name ILIKE '%fillmore%';

-- Compare with followed venues
SELECT venue_name, venue_city, venue_state
FROM venue_follows
WHERE venue_name ILIKE '%fillmore%';
```

### No Notifications Appearing
**Check:**
1. Trigger exists: `SELECT * FROM pg_trigger WHERE tgname LIKE '%venue%';`
2. Function exists: `SELECT * FROM pg_proc WHERE proname = 'notify_venue_followers_new_event';`
3. Event was inserted AFTER following (not before)
4. Check notifications table directly

```sql
SELECT * FROM notifications
WHERE user_id = 'user-uuid'
  AND type = 'venue_new_event'
ORDER BY created_at DESC;
```

### Button Not Showing
**Check:**
1. `userId` prop is provided
2. `venueName` prop is not empty
3. Component imported correctly
4. User is authenticated

## 🚀 Deployment Checklist

- [ ] Run SQL migration in Supabase
- [ ] Verify all functions created
- [ ] Test following a venue via SQL
- [ ] Test notification trigger
- [ ] Deploy frontend code
- [ ] Test UI components
- [ ] Verify real-time updates work
- [ ] Check RLS policies are active

## 📝 API Reference

### VenueFollowService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setVenueFollowByName` | userId, venueName, city?, state?, following | `Promise<void>` | Follow/unfollow venue |
| `isFollowingVenueByName` | venueName, city, state, userId | `Promise<boolean>` | Check follow status |
| `getFollowerCountByName` | venueName, city?, state? | `Promise<number>` | Get follower count |
| `getVenueFollowStatsByName` | venueName, city?, state?, userId? | `Promise<VenueFollowStats>` | Get count + status |
| `getUserFollowedVenues` | userId | `Promise<VenueFollowWithDetails[]>` | Get all followed venues |
| `getVenueFollowersByName` | venueName, city?, state? | `Promise<VenueFollowWithDetails[]>` | Get all followers |
| `subscribeToVenueFollows` | userId, callback | `RealtimeChannel` | Real-time updates |

## 💡 Best Practices

1. **Always include city/state** when venue name is ambiguous
2. **Normalize venue names** in your event import pipeline
3. **Use real-time subscriptions** for instant UI updates
4. **Handle null city/state** gracefully in queries
5. **Test with real venue data** from your JamBase integration

---

## ✅ Implementation Complete!

Your venue follow system is now fully functional and integrated throughout your app. Users can:
- ✅ Follow venues by name (with city/state for precision)
- ✅ See follower counts
- ✅ Receive notifications for new events at followed venues
- ✅ View all followed venues on the Following page
- ✅ See upcoming events for each followed venue

The system uses name-based matching for maximum flexibility and resilience! 🎸✨

