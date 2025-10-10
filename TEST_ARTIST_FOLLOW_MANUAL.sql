-- ============================================
-- MANUAL ARTIST FOLLOW TEST (No Auth Required)
-- ============================================
-- This version manually inserts follows for testing
-- Use this when testing from SQL Editor without auth

-- Step 1: Get a real user ID from your database
SELECT 
  'Step 1: Available Users' as step,
  id as user_id,
  email,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- Step 2: Get available artists
SELECT 
  'Step 2: Available Artists' as step,
  id as artist_id,
  name as artist_name,
  jambase_artist_id
FROM artists
LIMIT 5;

-- Step 3: Manual follow insert (REPLACE THE UUIDs BELOW)
-- Copy a user_id from Step 1 and an artist_id from Step 2

/*
-- Uncomment and replace with real UUIDs:
INSERT INTO artist_follows (user_id, artist_id)
VALUES (
  'USER_UUID_FROM_STEP_1'::uuid,
  'ARTIST_UUID_FROM_STEP_2'::uuid
)
ON CONFLICT (user_id, artist_id) DO NOTHING;
*/

-- Step 4: Verify the follow was created
SELECT 
  'Step 4: All Follows' as step,
  user_name,
  artist_name,
  created_at
FROM artist_follows_with_details
ORDER BY created_at DESC
LIMIT 10;

-- Step 5: Test follower count function
-- Uncomment and replace with artist UUID from Step 2:
/*
SELECT 
  'Step 5: Follower Count' as step,
  get_artist_follower_count('ARTIST_UUID_FROM_STEP_2'::uuid) as follower_count;
*/

-- Step 6: Test notification trigger by adding event
-- Uncomment and replace with real values:
/*
INSERT INTO jambase_events (
  jambase_event_id,
  title,
  artist_id,  -- This is jambase_artist_id (TEXT), not UUID!
  artist_name,
  venue_name,
  venue_city,
  venue_state,
  event_date
) VALUES (
  'test-' || gen_random_uuid()::text,
  'Test Concert - Follow Notification',
  'JAMBASE_ARTIST_ID_FROM_STEP_2',  -- e.g., 'jambase:123456'
  'ARTIST_NAME_FROM_STEP_2',
  'Test Venue',
  'New York',
  'NY',
  NOW() + INTERVAL '30 days'
);
*/

-- Step 7: Check if notifications were created
SELECT 
  'Step 7: Recent Notifications' as step,
  n.user_id,
  n.type,
  n.title,
  n.message,
  n.data->>'artist_name' as artist,
  n.created_at
FROM notifications n
WHERE n.type IN ('artist_new_event', 'artist_profile_updated')
ORDER BY n.created_at DESC
LIMIT 10;

-- Summary
SELECT 
  'SUMMARY' as info,
  (SELECT COUNT(*) FROM artist_follows) as total_follows,
  (SELECT COUNT(DISTINCT user_id) FROM artist_follows) as users_following,
  (SELECT COUNT(DISTINCT artist_id) FROM artist_follows) as artists_followed;

