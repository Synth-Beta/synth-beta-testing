-- Allow the 'reengagement' type used by send_reengagement_notifications()
-- (20261014190000_churn_reengagement_notifications.sql). Same list as the live
-- constraint, plus 'reengagement'. Widening only, so existing rows still validate.
--
-- Run this in the Supabase SQL editor.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'friend_request', 'friend_accepted', 'match', 'message', 'chat_message',
  'review_liked', 'review_commented', 'comment_replied', 'event_interest',
  'artist_followed', 'artist_new_event', 'venue_new_event', 'bucket_list_new_event',
  'friend_tagged_in_review', 'follows_new_events_summary', 'friends_event_interest_summary',
  'bucket_list_new_events_summary', 'event_reminder_1_week', 'event_reminder_3_days',
  'event_reminder_1_day', 'event_reminder_day_after',
  'reengagement'
]::text[]));

-- VERIFY
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'notifications_type_check';
