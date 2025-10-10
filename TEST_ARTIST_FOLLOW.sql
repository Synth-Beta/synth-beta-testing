-- ============================================
-- COMPLETE ARTIST FOLLOW TEST SCRIPT
-- ============================================
-- Copy and paste this entire script into Supabase SQL Editor
-- It will automatically follow an artist and verify it worked

-- Step 1: Show your user ID
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  RAISE NOTICE '✅ Your User ID: %', v_user_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '❌ You are not authenticated! Please log into your Supabase dashboard.';
  END IF;
END $$;

-- Step 2: Show available artists
SELECT 
  '📊 Available Artists to Follow:' as info,
  id as artist_uuid,
  name as artist_name,
  jambase_artist_id,
  image_url
FROM artists
WHERE id IS NOT NULL
LIMIT 5;

-- Step 3: Automatic follow test (follows the first artist)
-- This will work automatically without needing to copy/paste UUIDs
DO $$
DECLARE
  v_user_id UUID;
  v_artist_id UUID;
  v_artist_name TEXT;
  v_follower_count INTEGER;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Get first available artist
  SELECT id, name INTO v_artist_id, v_artist_name
  FROM artists
  LIMIT 1;
  
  IF v_artist_id IS NULL THEN
    RAISE NOTICE '❌ No artists found in database. Please add some artists first.';
    RETURN;
  END IF;
  
  RAISE NOTICE '🎵 Testing with artist: % (ID: %)', v_artist_name, v_artist_id;
  
  -- Follow the artist
  PERFORM set_artist_follow(v_artist_id, true);
  RAISE NOTICE '✅ Successfully followed %!', v_artist_name;
  
  -- Get follower count
  SELECT get_artist_follower_count(v_artist_id) INTO v_follower_count;
  RAISE NOTICE '👥 % now has % follower(s)', v_artist_name, v_follower_count;
  
  -- Check if we're following
  IF is_following_artist(v_artist_id, v_user_id) THEN
    RAISE NOTICE '✅ Confirmed: You are following %', v_artist_name;
  ELSE
    RAISE NOTICE '❌ Error: Follow did not work correctly';
  END IF;
END $$;

-- Step 4: Show all your follows
SELECT 
  '✅ Your Followed Artists:' as info,
  artist_name,
  jambase_artist_id,
  created_at as followed_at
FROM artist_follows_with_details
WHERE user_id = auth.uid()
ORDER BY created_at DESC;

-- Step 5: Show recent follows across all users
SELECT 
  '📊 Recent Follow Activity (All Users):' as info,
  user_name,
  artist_name,
  created_at as followed_at
FROM artist_follows_with_details
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- MANUAL FOLLOW TEST (if you want to follow a specific artist)
-- ============================================

-- Uncomment and replace the UUID below to follow a specific artist:
/*
-- First, find the artist you want:
SELECT id, name FROM artists WHERE name ILIKE '%artist name here%';

-- Then follow them (replace the UUID):
SELECT set_artist_follow('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, true);

-- Verify:
SELECT * FROM artist_follows_with_details WHERE user_id = auth.uid();
*/

-- ============================================
-- TEST NEW EVENT NOTIFICATION
-- ============================================

-- This will create a test event and trigger notification
-- Uncomment to run:
/*
DO $$
DECLARE
  v_user_id UUID;
  v_artist_id UUID;
  v_artist_name TEXT;
  v_jambase_artist_id TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Get an artist you're following
  SELECT artist_id, artist_name, jambase_artist_id 
  INTO v_artist_id, v_artist_name, v_jambase_artist_id
  FROM artist_follows_with_details
  WHERE user_id = v_user_id
  LIMIT 1;
  
  IF v_artist_id IS NULL THEN
    RAISE NOTICE '❌ You are not following any artists yet. Follow one first!';
    RETURN;
  END IF;
  
  RAISE NOTICE '🎭 Creating test event for % (jambase_id: %)', v_artist_name, v_jambase_artist_id;
  
  -- Insert test event
  INSERT INTO jambase_events (
    jambase_event_id,
    title,
    artist_id,
    artist_name,
    venue_name,
    venue_city,
    venue_state,
    event_date
  ) VALUES (
    'test-' || gen_random_uuid()::text,
    v_artist_name || ' Live in Concert - TEST EVENT',
    v_jambase_artist_id,
    v_artist_name,
    'Test Arena',
    'New York',
    'NY',
    NOW() + INTERVAL '30 days'
  );
  
  RAISE NOTICE '✅ Test event created! Check your notifications...';
  
  -- Show the notification
  PERFORM pg_sleep(1);  -- Wait a second for trigger to fire
  
  RAISE NOTICE '📬 Recent notifications:';
END $$;

-- Check notifications
SELECT 
  '📬 Your Artist Notifications:' as info,
  type,
  title,
  message,
  data->>'artist_name' as artist,
  data->>'event_title' as event,
  created_at
FROM notifications
WHERE user_id = auth.uid()
  AND type IN ('artist_new_event', 'artist_profile_updated')
ORDER BY created_at DESC
LIMIT 10;
*/

-- ============================================
-- CLEANUP (Unfollow test artist)
-- ============================================

-- Uncomment to unfollow all artists:
/*
DO $$
DECLARE
  v_follow RECORD;
BEGIN
  FOR v_follow IN 
    SELECT artist_id, artist_name 
    FROM artist_follows_with_details 
    WHERE user_id = auth.uid()
  LOOP
    PERFORM set_artist_follow(v_follow.artist_id, false);
    RAISE NOTICE '👋 Unfollowed %', v_follow.artist_name;
  END LOOP;
  
  RAISE NOTICE '✅ Cleanup complete!';
END $$;
*/

-- Final summary
SELECT 
  '📊 FOLLOW SYSTEM SUMMARY' as info,
  (SELECT COUNT(*) FROM artist_follows) as total_follows,
  (SELECT COUNT(DISTINCT user_id) FROM artist_follows) as users_following,
  (SELECT COUNT(DISTINCT artist_id) FROM artist_follows) as artists_with_followers;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Artist Follow System Test Complete!';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Check the results above';
  RAISE NOTICE '2. Test in your app by clicking a Follow button';
  RAISE NOTICE '3. Uncomment the "TEST NEW EVENT NOTIFICATION" section to test notifications';
  RAISE NOTICE '════════════════════════════════════════════════════';
END $$;

