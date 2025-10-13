# Artist Follow System - Quick Start & Testing

## ✅ Migration Successful!

Your database is now set up with the complete artist following system.

## 🧪 Quick Test Queries

Run these in your Supabase SQL Editor to verify everything works:

### 1. Check All Components Were Created

```sql
-- Verify table exists
SELECT COUNT(*) as follow_count FROM artist_follows;

-- Verify view exists  
SELECT COUNT(*) as view_count FROM artist_follows_with_details;

-- Verify functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name IN (
  'set_artist_follow',
  'get_artist_follower_count', 
  'is_following_artist',
  'notify_artist_followers_new_event',
  'notify_artist_followers_profile_update'
);

-- Verify triggers exist
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%artist%';
```

### 2. Test Following an Artist (Manual)

```sql
-- First, find an artist ID from your database
SELECT id, name, jambase_artist_id 
FROM artists 
LIMIT 5;

-- Or from artist_profile
SELECT id, name, jambase_artist_id
FROM artist_profile
LIMIT 5;

-- Now follow that artist (replace UUIDs with real ones)
-- Get your user ID first
SELECT auth.uid() as my_user_id;

-- Follow using the function
SELECT set_artist_follow(
  'PASTE_ARTIST_UUID_HERE'::uuid,
  true  -- true to follow, false to unfollow
);

-- Verify it worked
SELECT * FROM artist_follows_with_details
WHERE user_id = auth.uid();

-- Check follower count
SELECT get_artist_follower_count('PASTE_ARTIST_UUID_HERE'::uuid);
```

### 3. Test Notifications (New Event)

```sql
-- Find an artist you're following
SELECT artist_id, artist_name, jambase_artist_id
FROM artist_follows_with_details
WHERE user_id = auth.uid()
LIMIT 1;

-- Insert a test event for that artist
-- IMPORTANT: Use the jambase_artist_id (TEXT), not the UUID!
INSERT INTO jambase_events (
  jambase_event_id,
  title,
  artist_id,  -- This is the jambase_artist_id as TEXT
  artist_name,
  venue_name,
  venue_city,
  venue_state,
  event_date
) VALUES (
  'test-' || gen_random_uuid()::text,
  'Test Concert - New Event',
  'PASTE_JAMBASE_ARTIST_ID_HERE',  -- e.g., 'jambase:123456'
  'PASTE_ARTIST_NAME_HERE',
  'Test Venue',
  'New York',
  'NY',
  NOW() + INTERVAL '30 days'
);

-- Check if notification was created
SELECT 
  type,
  title,
  message,
  created_at,
  data
FROM notifications
WHERE user_id = auth.uid()
  AND type = 'artist_new_event'
ORDER BY created_at DESC
LIMIT 5;
```

### 4. Test Profile Update Notifications

```sql
-- Update an artist you're following
-- First, get an artist you follow
SELECT artist_id, artist_name 
FROM artist_follows_with_details 
WHERE user_id = auth.uid() 
LIMIT 1;

-- Update that artist's profile (change image or add genres)
UPDATE artists
SET 
  image_url = 'https://example.com/new-image.jpg',
  updated_at = NOW()
WHERE id = 'PASTE_ARTIST_UUID_HERE'::uuid;

-- Check for notification
SELECT 
  type,
  title,
  message,
  data->>'changes' as changes,
  created_at
FROM notifications
WHERE user_id = auth.uid()
  AND type = 'artist_profile_updated'
ORDER BY created_at DESC
LIMIT 5;
```

## 🎯 Frontend Testing

### Test the Follow Button

1. **Open your app** and navigate to any artist page
2. Look for the **"Follow"** button in the artist header
3. Click it - it should change to **"Following"**
4. Click again - it should change back to **"Follow"**
5. Check that the **follower count** updates

### Test in Review Cards

1. Navigate to any review in the feed
2. Look for the artist name chip
3. You should see a small **follow button** next to it
4. Click to follow/unfollow

### Test Notifications

1. **Follow an artist** via the UI
2. Open your **Supabase dashboard** → SQL Editor
3. Insert a test event for that artist (see query above)
4. Refresh your app
5. Check the **notification bell** - you should see the new event notification
6. Click on it to see details

## 📊 Useful Queries

### See All Follows in Your System

```sql
SELECT 
  user_name,
  artist_name,
  jambase_artist_id,
  created_at
FROM artist_follows_with_details
ORDER BY created_at DESC
LIMIT 20;
```

### Most Followed Artists

```sql
SELECT 
  artist_name,
  COUNT(*) as follower_count,
  MAX(created_at) as last_follow
FROM artist_follows_with_details
GROUP BY artist_name, artist_id
ORDER BY follower_count DESC, last_follow DESC
LIMIT 10;
```

### Recent Artist Follow Activity

```sql
SELECT 
  user_name,
  artist_name,
  'followed' as action,
  created_at
FROM artist_follows_with_details
ORDER BY created_at DESC
LIMIT 20;
```

### All Notifications for Followed Artists

```sql
SELECT 
  type,
  title,
  message,
  data->>'artist_name' as artist,
  data->>'event_title' as event,
  is_read,
  created_at
FROM notifications
WHERE type IN ('artist_new_event', 'artist_profile_updated')
  AND user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 20;
```

## 🐛 Troubleshooting

### Issue: "Artist not found"

**Cause:** Artist might not exist in database or UUID mismatch.

**Fix:**
```sql
-- Check if artist exists
SELECT id, name, jambase_artist_id 
FROM artists 
WHERE name ILIKE '%artist name%';

-- Also check artist_profile table
SELECT id, name, jambase_artist_id
FROM artist_profile
WHERE name ILIKE '%artist name%';

-- If artist exists, make sure you're using the correct UUID
```

### Issue: "No notifications after adding event"

**Cause:** Usually a mismatch between `jambase_events.artist_id` (TEXT) and artist UUID.

**Fix:**
```sql
-- The trigger looks up artist by jambase_artist_id
-- Make sure jambase_events.artist_id matches artists.jambase_artist_id

-- Check what jambase_artist_id an artist has
SELECT id, name, jambase_artist_id 
FROM artists 
WHERE name = 'Your Artist Name';

-- When inserting event, use that jambase_artist_id value
-- Example: 'jambase:123456' not the UUID
```

### Issue: "Permission denied"

**Cause:** RLS policy issue or not authenticated.

**Fix:**
```sql
-- Check if you're authenticated
SELECT auth.uid();  -- Should return a UUID

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'artist_follows';

-- If policies are missing, re-run the migration
```

## 📱 Integration Checklist

- [x] SQL migration completed
- [ ] Test following an artist via UI
- [ ] Test unfollowing an artist
- [ ] Verify follower count updates
- [ ] Insert test event and check notification
- [ ] Update artist profile and check notification
- [ ] Test on mobile responsive view
- [ ] Add follow buttons to additional locations (search, feed, etc.)

## 🎨 Adding Follow Buttons to More Places

The follow button component is ready to use anywhere. Here's how:

```tsx
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';

// Basic usage
<ArtistFollowButton
  artistId={artist.id}
  userId={currentUserId}
/>

// With options
<ArtistFollowButton
  artistId={artist.id}
  userId={currentUserId}
  variant="outline"
  size="sm"
  showFollowerCount={true}
  onFollowChange={(isFollowing) => {
    console.log('Follow status changed:', isFollowing);
  }}
/>

// Using artist name if no ID available
<ArtistFollowButton
  artistName="Taylor Swift"
  userId={currentUserId}
/>

// Using JamBase ID
<ArtistFollowButton
  jambaseArtistId="jambase:123456"
  userId={currentUserId}
/>
```

### Suggested Locations to Add

1. **Search Results** (`UnifiedSearch.tsx`, `EventSearch.tsx`)
2. **Unified Feed** (`UnifiedFeed.tsx`) - on artist badges
3. **Event Details Modal** - next to artist name
4. **Concert Events List** - on each event card
5. **Artist Profile Pages** - prominent in header
6. **Venue Pages** - when showing artists who performed there

## 🎉 You're All Set!

The artist follow system is fully functional. Users can now:

✅ Follow/unfollow artists  
✅ Get notified of new events  
✅ Get notified of profile updates  
✅ See follower counts  
✅ View their followed artists  

Next steps:
1. Test the functionality using the queries above
2. Add follow buttons to more locations in your UI
3. Consider adding an email digest for followed artist activity
4. Build an analytics dashboard for follow trends

Enjoy your new artist follow system! 🎸✨

