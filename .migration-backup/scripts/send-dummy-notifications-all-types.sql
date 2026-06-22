-- ============================================
-- Send dummy notifications of ALL types to a specific user
-- User: 349bda34-7878-4c10-9f86-ec5888e55571
-- Run in Supabase SQL Editor
-- ============================================

INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'friend_request', '[Test] New Friend Request', 'Someone wants to connect with you!', '{"sender_id":"349bda34-7878-4c10-9f86-ec5888e55571","request_id":"349bda34-7878-4c10-9f86-ec5888e55571","sender_name":"Test User"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'friend_accepted', '[Test] Friend Request Accepted', 'Your friend request has been accepted.', '{"friend_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'match', '[Test] It''s a Match!', 'You and someone both want to meet up!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'message', '[Test] New Message', 'Someone: Hello world', '{"chat_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'chat_message', '[Test] Chat Message', 'Test User: This is a test chat message', '{"chat_id":"349bda34-7878-4c10-9f86-ec5888e55571","sender_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'review_liked', '[Test] Review Liked', 'Someone liked your review of Taylor Swift at Madison Square Garden', '{"review_id":"349bda34-7878-4c10-9f86-ec5888e55571","event_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'review_commented', '[Test] Review Commented', 'Someone commented on your review', '{"review_id":"349bda34-7878-4c10-9f86-ec5888e55571","comment_id":"349bda34-7878-4c10-9f86-ec5888e55571","event_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'comment_replied', '[Test] Comment Replied', 'Someone replied to your comment', '{"review_id":"349bda34-7878-4c10-9f86-ec5888e55571","comment_id":"349bda34-7878-4c10-9f86-ec5888e55571","event_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'event_interest', '[Test] Event Interest', 'Someone is interested in the same event!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571","event_title":"Taylor Swift at MSG"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'artist_followed', '[Test] Artist Followed', 'Someone started following an artist you follow', '{"artist_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'artist_new_event', '[Test] Artist New Event', 'Taylor Swift has a new show!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571","artist_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'venue_new_event', '[Test] Venue New Event', 'Madison Square Garden has a new show!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571","venue_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'bucket_list_new_event', '[Test] Bucket List New Event', 'Taylor Swift has a new show!', '{"event_id":"349bda34-7878-4c10-9f86-ec5888e55571","artist_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'friend_tagged_in_review', '[Test] Tagged in Review', 'Someone tagged you in their review of Taylor Swift at MSG', '{"review_id":"349bda34-7878-4c10-9f86-ec5888e55571","artist_id":"349bda34-7878-4c10-9f86-ec5888e55571","venue_id":"349bda34-7878-4c10-9f86-ec5888e55571"}', false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'follows_new_events_summary', '[Test] Follows New Events Summary', 'Artists and venues you follow announced 5 new events today', '{"count":5}'::jsonb, false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'friends_event_interest_summary', '[Test] Friends Event Interest Summary', 'Your friends expressed interest in 3 new events today - don''t let them go alone!', '{"count":3}'::jsonb, false),
  ('349bda34-7878-4c10-9f86-ec5888e55571', 'bucket_list_new_events_summary', '[Test] Bucket List Summary', 'Your bucket list has 2 new events today!', '{"count":2}'::jsonb, false);
