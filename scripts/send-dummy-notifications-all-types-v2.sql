-- ============================================
-- Send dummy notifications - Batch 2 (ALL types)
-- User: 349bda34-7878-4c10-9f86-ec5888e55571
-- Run in Supabase SQL Editor
-- ============================================

INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'friend_request', '[Test 2] Friend Request', 'Alex wants to connect with you!', '{"sender_id":"349bda34-7878-4c10-9f86-ec5888e55571","request_id":"349bda34-7878-4c10-9f86-ec5888e55571","sender_name":"Alex"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'friend_accepted', '[Test 2] Friend Accepted', 'Jordan accepted your friend request!', '{"friend_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'match', '[Test 2] New Match', 'You and Sam both want to meet at Red Rocks!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'message', '[Test 2] New Message', 'New message in Concert Crew', '{"chat_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'chat_message', '[Test 2] Chat', 'New message from Riley', '{"chat_id":"349bda34-7878-4c10-9f86-ec5888e55571","sender_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'review_liked', '[Test 2] Review Liked', 'Morgan liked your Phoenix review', '{"review_id":"349bda34-7878-4c10-9f86-ec5888e55571","event_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'review_commented', '[Test 2] New Comment', 'Casey commented on your review', '{"review_id":"349bda34-7878-4c10-9f86-ec5888e55571","comment_id":"349bda34-7878-4c10-9f86-ec5888e55571","event_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'comment_replied', '[Test 2] Reply', 'Taylor replied to your comment', '{"review_id":"349bda34-7878-4c10-9f86-ec5888e55571","comment_id":"349bda34-7878-4c10-9f86-ec5888e55571","event_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'event_interest', '[Test 2] Same Event', 'Quinn is interested in Beyoncé at Barclays too!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571","event_title":"Beyoncé at Barclays"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'artist_followed', '[Test 2] Artist Follow', 'Jamie now follows Dua Lipa', '{"artist_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'artist_new_event', '[Test 2] New Show', 'Phoenix announced a new tour date!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571","artist_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'venue_new_event', '[Test 2] Venue Event', 'Brooklyn Bowl has a new show coming up!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571","venue_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'bucket_list_new_event', '[Test 2] Bucket List', 'Foo Fighters has a new show!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571","artist_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'friend_tagged_in_review', '[Test 2] Tagged', 'You were tagged in a review of LCD Soundsystem at Terminal 5', '{"review_id":"349bda34-7878-4c10-9f86-ec5888e55571","artist_id":"349bda34-7878-4c10-9f86-ec5888e55571","venue_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'follows_new_events_summary', '[Test 2] Daily Summary', 'Artists and venues you follow announced 12 new events today', '{"count":12}'::jsonb, false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'friends_event_interest_summary', '[Test 2] Friends Going', 'Your friends expressed interest in 7 new events today - don''t let them go alone!', '{"count":7}'::jsonb, false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'bucket_list_new_events_summary', '[Test 2] Bucket List Summary', 'Your bucket list has 4 new events today!', '{"count":4}'::jsonb, false);
