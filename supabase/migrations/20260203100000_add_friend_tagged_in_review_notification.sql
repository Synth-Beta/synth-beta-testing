-- Add 'friend_tagged_in_review' notification type for when a user tags a friend in a review.
-- The tagged friend receives a notification and can write their own review with artist, venue, date, and friends pre-filled.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'notifications'
    AND constraint_name LIKE '%notifications_type_check%'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  END IF;

  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request',
    'friend_accepted',
    'match',
    'message',
    'review_liked',
    'review_commented',
    'comment_replied',
    'event_interest',
    'artist_followed',
    'artist_new_event',
    'artist_profile_updated',
    'venue_new_event',
    'venue_profile_updated',
    'bucket_list_new_event',
    'friend_tagged_in_review'
  ));
END $$;
