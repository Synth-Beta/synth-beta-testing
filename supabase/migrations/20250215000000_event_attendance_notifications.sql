-- Event Attendance Notification System
-- This migration creates the infrastructure for sending post-event attendance notifications
-- to users who expressed interest in events that have passed

-- ============================================================================
-- 1. Update notification type constraint to include event_attendance_reminder
-- ============================================================================

ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  'friend_request',
  'friend_accepted',
  'match',
  'message',
  'review_liked',
  'review_commented',
  'comment_replied',
  'event_interest',
  'event_attendance_reminder',
  'artist_followed',
  'artist_new_event',
  'artist_profile_updated',
  'venue_new_event',
  'venue_profile_updated'
));

-- ============================================================================
-- 2. Create table to track sent attendance notifications (prevent duplicates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_attendance_notifications_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_notifications_user_id 
  ON public.event_attendance_notifications_sent(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_notifications_event_id 
  ON public.event_attendance_notifications_sent(event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_notifications_sent_at 
  ON public.event_attendance_notifications_sent(sent_at DESC);

-- Enable RLS
ALTER TABLE public.event_attendance_notifications_sent ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notification tracking records
CREATE POLICY "Users can view their own attendance notification records"
  ON public.event_attendance_notifications_sent
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add helpful comment
COMMENT ON TABLE public.event_attendance_notifications_sent IS 
  'Tracks which attendance reminder notifications have been sent to prevent duplicates';

-- ============================================================================
-- 3. Function to send attendance reminder notifications for past events
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_attendance_reminder_notifications(
  days_after_event INTEGER DEFAULT 1
)
RETURNS TABLE (
  notifications_sent INTEGER,
  users_notified UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_count INTEGER := 0;
  notified_users UUID[] := ARRAY[]::UUID[];
  interest_record RECORD;
  event_record RECORD;
  notification_id UUID;
BEGIN
  -- Find all users who expressed interest in events that:
  -- 1. Happened X days ago (configurable, default 1 day)
  -- 2. User hasn't marked attendance or written a review
  -- 3. Haven't been sent a notification yet
  
  FOR interest_record IN
    SELECT 
      uje.user_id,
      uje.jambase_event_id as event_id
    FROM public.user_jambase_events uje
    INNER JOIN public.jambase_events je ON uje.jambase_event_id = je.id
    LEFT JOIN public.user_reviews ur ON (
      ur.user_id = uje.user_id 
      AND ur.event_id = uje.jambase_event_id
    )
    LEFT JOIN public.event_attendance_notifications_sent eans ON (
      eans.user_id = uje.user_id 
      AND eans.event_id = uje.jambase_event_id
    )
    WHERE 
      -- Event happened between X and X+7 days ago (window to send notification)
      je.event_date < (now() - (days_after_event || ' days')::INTERVAL)
      AND je.event_date > (now() - ((days_after_event + 7) || ' days')::INTERVAL)
      -- User hasn't marked attendance yet
      AND (ur.id IS NULL OR ur.was_there IS NULL OR ur.was_there = false)
      -- Notification hasn't been sent yet
      AND eans.id IS NULL
  LOOP
    -- Get event details
    SELECT 
      je.id,
      je.title,
      COALESCE(je.venue_name, 'Unknown Venue') as venue_name,
      je.event_date,
      je.artist_name
    INTO event_record
    FROM public.jambase_events je
    WHERE je.id = interest_record.event_id;
    
    -- Skip if event not found (shouldn't happen, but safety check)
    CONTINUE WHEN event_record IS NULL;
    
    -- Create the notification
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      interest_record.user_id,
      'event_attendance_reminder',
      'Did you attend this event? 📍',
      'You were interested in ' || event_record.title || ' at ' || event_record.venue_name || '. Did you go?',
      jsonb_build_object(
        'event_id', event_record.id,
        'event_title', event_record.title,
        'event_venue', event_record.venue_name,
        'event_date', event_record.event_date,
        'artist_name', event_record.artist_name
      )
    )
    RETURNING id INTO notification_id;
    
    -- Track that we sent this notification
    INSERT INTO public.event_attendance_notifications_sent (
      user_id,
      event_id,
      notification_id
    ) VALUES (
      interest_record.user_id,
      event_record.id,
      notification_id
    );
    
    -- Increment counter and track user
    notification_count := notification_count + 1;
    notified_users := array_append(notified_users, interest_record.user_id);
    
  END LOOP;
  
  -- Return results
  RETURN QUERY SELECT notification_count, notified_users;
END;
$$;

-- Grant execute permissions to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.send_attendance_reminder_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_attendance_reminder_notifications TO service_role;

COMMENT ON FUNCTION public.send_attendance_reminder_notifications IS 
  'Sends attendance reminder notifications to users who expressed interest in past events but haven''t marked attendance yet. Call this function via a cron job or manually.';

-- ============================================================================
-- 4. Helper function to manually trigger for a specific event
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_attendance_reminder_for_event(
  p_event_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_count INTEGER := 0;
  interest_record RECORD;
  event_record RECORD;
  notification_id UUID;
BEGIN
  -- Get event details
  SELECT 
    je.id,
    je.title,
    COALESCE(je.venue_name, 'Unknown Venue') as venue_name,
    je.event_date,
    je.artist_name
  INTO event_record
  FROM public.jambase_events je
  WHERE je.id = p_event_id;
  
  -- Return 0 if event not found
  IF event_record IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Find all users who expressed interest but haven't marked attendance
  FOR interest_record IN
    SELECT 
      uje.user_id
    FROM public.user_jambase_events uje
    LEFT JOIN public.user_reviews ur ON (
      ur.user_id = uje.user_id 
      AND ur.event_id = uje.jambase_event_id
    )
    LEFT JOIN public.event_attendance_notifications_sent eans ON (
      eans.user_id = uje.user_id 
      AND eans.event_id = uje.jambase_event_id
    )
    WHERE 
      uje.jambase_event_id = p_event_id
      -- User hasn't marked attendance yet
      AND (ur.id IS NULL OR ur.was_there IS NULL OR ur.was_there = false)
      -- Notification hasn't been sent yet
      AND eans.id IS NULL
  LOOP
    -- Create the notification
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      interest_record.user_id,
      'event_attendance_reminder',
      'Did you attend this event? 📍',
      'You were interested in ' || event_record.title || ' at ' || event_record.venue_name || '. Did you go?',
      jsonb_build_object(
        'event_id', event_record.id,
        'event_title', event_record.title,
        'event_venue', event_record.venue_name,
        'event_date', event_record.event_date,
        'artist_name', event_record.artist_name
      )
    )
    RETURNING id INTO notification_id;
    
    -- Track that we sent this notification
    INSERT INTO public.event_attendance_notifications_sent (
      user_id,
      event_id,
      notification_id
    ) VALUES (
      interest_record.user_id,
      event_record.id,
      notification_id
    );
    
    notification_count := notification_count + 1;
  END LOOP;
  
  RETURN notification_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_attendance_reminder_for_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_attendance_reminder_for_event TO service_role;

COMMENT ON FUNCTION public.send_attendance_reminder_for_event IS 
  'Sends attendance reminder notifications for a specific event to all interested users who haven''t marked attendance.';

-- ============================================================================
-- 5. View to monitor attendance notification status
-- ============================================================================

CREATE OR REPLACE VIEW public.attendance_notification_stats AS
SELECT 
  date_trunc('day', sent_at) as date,
  COUNT(*) as notifications_sent,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT event_id) as unique_events
FROM public.event_attendance_notifications_sent
GROUP BY date_trunc('day', sent_at)
ORDER BY date DESC;

GRANT SELECT ON public.attendance_notification_stats TO authenticated;

COMMENT ON VIEW public.attendance_notification_stats IS 
  'Statistics on attendance reminder notifications sent by day';

-- ============================================================================
-- 6. Add helpful indexes to optimize notification queries
-- ============================================================================

-- Index to find notifications by event_id in data field
CREATE INDEX IF NOT EXISTS idx_notifications_data_event_id 
  ON public.notifications USING gin ((data->'event_id'));

-- ============================================================================
-- EXAMPLE USAGE
-- ============================================================================

-- To send notifications for events that happened 1 day ago (default):
-- SELECT * FROM public.send_attendance_reminder_notifications();

-- To send notifications for events that happened 2 days ago:
-- SELECT * FROM public.send_attendance_reminder_notifications(2);

-- To send notifications for a specific event:
-- SELECT public.send_attendance_reminder_for_event('event-uuid-here');

-- To view statistics:
-- SELECT * FROM public.attendance_notification_stats;

