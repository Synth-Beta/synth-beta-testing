-- ============================================
-- IMPLEMENT 5 CORE NOTIFICATION TYPES
-- ============================================
-- This migration implements the 5 core notification types:
-- 1. Friend Request receipt
-- 2. Chat receipt (name of sender and content)
-- 3. Friend interested in event
-- 4. Artist or Venue you follow announces new event
-- 5. For events the user is interested in: 1 week | 3 days | 1 day | Day after to review

-- ============================================
-- STEP 1: UPDATE NOTIFICATION TYPE CONSTRAINT
-- ============================================

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
  'venue_profile_updated',
  'bucket_list_new_event',
  -- Event reminder types
  'event_reminder_1_week',
  'event_reminder_3_days',
  'event_reminder_1_day',
  'event_reminder_day_after'
));

-- ============================================
-- STEP 2: FRIEND REQUEST NOTIFICATION
-- ============================================
-- Trigger when a friend request is created in user_relationships

CREATE OR REPLACE FUNCTION public.notify_friend_request_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name TEXT;
  sender_avatar_url TEXT;
BEGIN
  -- Only process friend requests (not other relationship types)
  IF NEW.relationship_type != 'friend' OR NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  -- Get sender's name and avatar
  SELECT name, avatar_url INTO sender_name, sender_avatar_url
  FROM public.users
  WHERE user_id = NEW.user_id;

  -- Create notification for the receiver
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data,
    actor_user_id
  ) VALUES (
    NEW.related_user_id,
    'friend_request',
    'New Friend Request',
    COALESCE(sender_name, 'Someone') || ' wants to connect with you!',
    jsonb_build_object(
      'sender_id', NEW.user_id,
      'sender_name', sender_name,
      'sender_avatar_url', sender_avatar_url,
      'request_id', NEW.id
    ),
    NEW.user_id
  );

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS notify_friend_request_trigger ON public.user_relationships;

-- Create trigger for friend requests
CREATE TRIGGER notify_friend_request_trigger
  AFTER INSERT ON public.user_relationships
  FOR EACH ROW
  WHEN (NEW.relationship_type = 'friend' AND NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_friend_request_received();

COMMENT ON FUNCTION public.notify_friend_request_received() IS 
  'Creates a notification when a user receives a friend request';

-- ============================================
-- STEP 3: CHAT MESSAGE NOTIFICATION
-- ============================================
-- Trigger when a regular chat message is sent (not event shares)

CREATE OR REPLACE FUNCTION public.notify_chat_message_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name TEXT;
  sender_avatar_url TEXT;
  chat_participants UUID[];
  recipient_id UUID;
  chat_name TEXT;
  is_direct_chat BOOLEAN;
BEGIN
  -- Skip event share messages (handled by other trigger)
  IF NEW.message_type = 'event_share' THEN
    RETURN NEW;
  END IF;

  -- Get sender's name and avatar
  SELECT name, avatar_url INTO sender_name, sender_avatar_url
  FROM public.users
  WHERE user_id = NEW.sender_id;

  -- Get chat participants
  SELECT 
    array_agg(cp.user_id) FILTER (WHERE cp.user_id != NEW.sender_id),
    c.is_group_chat,
    c.name
  INTO chat_participants, is_direct_chat, chat_name
  FROM public.chat_participants cp
  INNER JOIN public.chats c ON cp.chat_id = c.id
  WHERE cp.chat_id = NEW.chat_id
  GROUP BY c.is_group_chat, c.name;

  -- If no participants found, skip
  IF chat_participants IS NULL OR array_length(chat_participants, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- For direct chats, notify the other participant
  -- For group chats, notify all participants except sender
  IF is_direct_chat = false THEN
    -- Group chat: notify all participants
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      actor_user_id
    )
    SELECT
      user_id,
      'message',
      COALESCE(chat_name, 'Group Chat'),
      COALESCE(sender_name, 'Someone') || ': ' || 
      CASE 
        WHEN length(NEW.content) > 100 THEN left(NEW.content, 100) || '...'
        ELSE NEW.content
      END,
      jsonb_build_object(
        'sender_id', NEW.sender_id,
        'sender_name', sender_name,
        'sender_avatar_url', sender_avatar_url,
        'chat_id', NEW.chat_id,
        'chat_name', chat_name,
        'message_id', NEW.id,
        'message_content', NEW.content,
        'is_group_chat', true
      ),
      NEW.sender_id
    FROM unnest(chat_participants) AS user_id;
  ELSE
    -- Direct chat: notify the other participant
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      actor_user_id
    ) VALUES (
      chat_participants[1],
      'message',
      COALESCE(sender_name, 'New Message'),
      COALESCE(sender_name, 'Someone') || ': ' || 
      CASE 
        WHEN length(NEW.content) > 100 THEN left(NEW.content, 100) || '...'
        ELSE NEW.content
      END,
      jsonb_build_object(
        'sender_id', NEW.sender_id,
        'sender_name', sender_name,
        'sender_avatar_url', sender_avatar_url,
        'chat_id', NEW.chat_id,
        'message_id', NEW.id,
        'message_content', NEW.content,
        'is_group_chat', false
      ),
      NEW.sender_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS notify_chat_message_trigger ON public.messages;

-- Create trigger for chat messages
CREATE TRIGGER notify_chat_message_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.message_type IS NULL OR NEW.message_type = 'text')
  EXECUTE FUNCTION public.notify_chat_message_received();

COMMENT ON FUNCTION public.notify_chat_message_received() IS 
  'Creates notifications when users receive chat messages with sender name and content preview';

-- ============================================
-- STEP 4: FRIEND INTERESTED IN EVENT
-- ============================================
-- Update trigger to work with user_event_relationships table

CREATE OR REPLACE FUNCTION public.notify_friend_event_interest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  friend_record RECORD;
  event_title TEXT;
  user_name TEXT;
  event_venue TEXT;
  event_date TEXT;
  event_artist TEXT;
  event_id UUID;
BEGIN
  -- Only process event interest relationships (interested, going, maybe)
  IF NEW.relationship_type NOT IN ('interested', 'going', 'maybe') THEN
    RETURN NEW;
  END IF;

  -- Get event details from events table
  SELECT 
    e.id,
    e.title,
    COALESCE(
      (SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
      e.venue_city || ', ' || e.venue_state,
      'Unknown Venue'
    ) as venue_name,
    e.event_date::text,
    COALESCE(
      (SELECT a.name FROM public.artists a WHERE a.id = e.artist_id),
      ''
    ) as artist_name
  INTO event_id, event_title, event_venue, event_date, event_artist
  FROM public.events e
  WHERE e.id = NEW.event_id;

  -- Get user's name
  SELECT name INTO user_name
  FROM public.users
  WHERE user_id = NEW.user_id;

  -- If we couldn't find event or user details, skip notification
  IF event_title IS NULL OR user_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find all friends (accepted friend relationships)
  FOR friend_record IN
    SELECT 
      CASE 
        WHEN ur.user_id = NEW.user_id THEN ur.related_user_id
        ELSE ur.user_id
      END as friend_id
    FROM public.user_relationships ur
    WHERE (
      (ur.user_id = NEW.user_id AND ur.related_user_id != NEW.user_id)
      OR (ur.related_user_id = NEW.user_id AND ur.user_id != NEW.user_id)
    )
    AND ur.relationship_type = 'friend'
    AND ur.status = 'accepted'
  LOOP
    -- Insert notification for this friend
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      actor_user_id
    ) VALUES (
      friend_record.friend_id,
      'event_interest',
      'Friend Interested in Event!',
      COALESCE(user_name, 'Your friend') || ' is interested in "' || event_title || '" at ' || COALESCE(event_venue, 'a venue'),
      jsonb_build_object(
        'interested_user_id', NEW.user_id,
        'event_id', event_id,
        'event_title', event_title,
        'event_venue', event_venue,
        'event_date', event_date,
        'event_artist', event_artist,
        'user_name', user_name
      ),
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger for user_event_relationships table
DROP TRIGGER IF EXISTS notify_friend_event_interest_trigger ON public.user_event_relationships;
CREATE TRIGGER notify_friend_event_interest_trigger
  AFTER INSERT ON public.user_event_relationships
  FOR EACH ROW
  WHEN (NEW.relationship_type IN ('interested', 'going', 'maybe'))
  EXECUTE FUNCTION public.notify_friend_event_interest();

COMMENT ON FUNCTION public.notify_friend_event_interest() IS 
  'Notifies all friends when a user expresses interest in an event';

-- ============================================
-- STEP 5: ARTIST/VENUE NEW EVENT NOTIFICATIONS
-- ============================================
-- Update to work with follows table (3NF compliant)

-- Artist new event notification
CREATE OR REPLACE FUNCTION public.notify_artist_followers_new_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follower_record RECORD;
  artist_name TEXT;
  venue_name TEXT;
BEGIN
  -- Skip if no artist_id
  IF NEW.artist_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get artist name directly from artists table (artist_id is UUID foreign key)
  SELECT name INTO artist_name
  FROM public.artists
  WHERE id = NEW.artist_id;

  -- If artist not found, skip
  IF artist_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get venue name if venue_id exists
  IF NEW.venue_id IS NOT NULL THEN
    SELECT name INTO venue_name
    FROM public.venues
    WHERE id = NEW.venue_id;
  END IF;

  -- Find all followers using artist_follows table
  FOR follower_record IN
    SELECT user_id
    FROM public.artist_follows
    WHERE artist_id = NEW.artist_id
  LOOP
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      follower_record.user_id,
      'artist_new_event',
      artist_name || ' has a new event!',
      artist_name || ' is performing at "' || NEW.title || '" at ' || COALESCE(venue_name, NEW.venue_city || ', ' || NEW.venue_state, 'a venue') || ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
      jsonb_build_object(
        'artist_id', NEW.artist_id,
        'artist_name', artist_name,
        'event_id', NEW.id,
        'event_title', NEW.title,
        'venue_name', COALESCE(venue_name, NEW.venue_city || ', ' || NEW.venue_state),
        'event_date', NEW.event_date
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_notify_artist_followers_new_event ON public.events;

-- Create trigger for events table
CREATE TRIGGER trigger_notify_artist_followers_new_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  WHEN (NEW.artist_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_artist_followers_new_event();

-- Venue new event notification
CREATE OR REPLACE FUNCTION public.notify_venue_followers_new_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follower_record RECORD;
  venue_name TEXT;
BEGIN
  -- Skip if no venue_id
  IF NEW.venue_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get venue name directly from venues table (venue_id is UUID foreign key)
  SELECT name INTO venue_name
  FROM public.venues
  WHERE id = NEW.venue_id;

  -- If venue not found, use venue_city/venue_state as fallback
  IF venue_name IS NULL THEN
    venue_name := COALESCE(NEW.venue_city || ', ' || NEW.venue_state, 'a venue');
  END IF;

  -- Find all followers using user_venue_relationships table
  FOR follower_record IN
    SELECT user_id
    FROM public.user_venue_relationships
    WHERE venue_id = NEW.venue_id
  LOOP
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      follower_record.user_id,
      'venue_new_event',
      'New event at ' || venue_name || '!',
      'A new event "' || NEW.title || '" is happening at ' || venue_name || ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
      jsonb_build_object(
        'venue_id', NEW.venue_id,
        'venue_name', venue_name,
        'event_id', NEW.id,
        'event_title', NEW.title,
        'event_date', NEW.event_date
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger for venue events
DROP TRIGGER IF EXISTS trigger_notify_venue_followers_new_event ON public.events;

CREATE TRIGGER trigger_notify_venue_followers_new_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  WHEN (NEW.venue_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_venue_followers_new_event();

COMMENT ON FUNCTION public.notify_artist_followers_new_event() IS 
  'Notifies all followers when an artist they follow has a new event';

COMMENT ON FUNCTION public.notify_venue_followers_new_event() IS 
  'Notifies all followers when a venue they follow has a new event';

-- ============================================
-- STEP 6: EVENT REMINDER SYSTEM
-- ============================================
-- Comprehensive system for event reminders: 1 week, 3 days, 1 day, and day after

-- Table to track which reminders have been sent
CREATE TABLE IF NOT EXISTS public.event_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN (
    'event_reminder_1_week',
    'event_reminder_3_days',
    'event_reminder_1_day',
    'event_reminder_day_after'
  )),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id, reminder_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_id 
  ON public.event_reminders_sent(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_event_id 
  ON public.event_reminders_sent(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_type 
  ON public.event_reminders_sent(reminder_type);
CREATE INDEX IF NOT EXISTS idx_event_reminders_sent_at 
  ON public.event_reminders_sent(sent_at DESC);

-- Enable RLS
ALTER TABLE public.event_reminders_sent ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can view their own reminder records"
  ON public.event_reminders_sent
  FOR SELECT
  USING (auth.uid() = user_id);

-- Function to send event reminders
-- Drop existing function first if it exists (in case return type changed)
DROP FUNCTION IF EXISTS public.send_event_reminders();

CREATE OR REPLACE FUNCTION public.send_event_reminders()
RETURNS TABLE(
  notifications_sent INTEGER,
  reminders_sent JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_count INTEGER := 0;
  reminder_summary JSONB := '[]'::JSONB;
  interest_record RECORD;
  event_record RECORD;
  notification_id UUID;
  reminder_type TEXT;
  days_until_event INTEGER;
  reminder_sent_count INTEGER;
BEGIN
  -- Find all users interested in upcoming events
  FOR interest_record IN
    SELECT 
      uer.user_id,
      uer.event_id
    FROM public.user_event_relationships uer
    WHERE uer.relationship_type IN ('interested', 'going', 'maybe')
  LOOP
    -- Get event details from events table
    SELECT 
      e.id,
      e.title,
      COALESCE(
        (SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
        e.venue_city || ', ' || e.venue_state,
        'Unknown Venue'
      ) as venue_name,
      e.event_date,
      COALESCE(
        (SELECT a.name FROM public.artists a WHERE a.id = e.artist_id),
        ''
      ) as artist_name
    INTO event_record
    FROM public.events e
    WHERE e.id = interest_record.event_id
      AND e.event_date >= now()  -- Only future events
      AND e.event_date <= (now() + interval '8 days');  -- Within 8 days

    -- Skip if event not found or too far in future
    CONTINUE WHEN event_record IS NULL;

    -- Calculate days until event
    days_until_event := EXTRACT(EPOCH FROM (event_record.event_date - now())) / 86400;

    -- Determine which reminder to send
    -- 1 week (7 days) - send between 7-8 days
    IF days_until_event >= 7 AND days_until_event < 8 THEN
      reminder_type := 'event_reminder_1_week';
    -- 3 days - send between 3-4 days
    ELSIF days_until_event >= 3 AND days_until_event < 4 THEN
      reminder_type := 'event_reminder_3_days';
    -- 1 day - send between 1-2 days
    ELSIF days_until_event >= 1 AND days_until_event < 2 THEN
      reminder_type := 'event_reminder_1_day';
    ELSE
      -- Skip if not in a reminder window
      CONTINUE;
    END IF;

    -- Check if this reminder has already been sent
    IF EXISTS (
      SELECT 1 FROM public.event_reminders_sent
      WHERE user_id = interest_record.user_id
        AND event_id = interest_record.event_id
        AND reminder_type = reminder_type
    ) THEN
      CONTINUE;
    END IF;

    -- Create the notification
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      interest_record.user_id,
      reminder_type,
      CASE reminder_type
        WHEN 'event_reminder_1_week' THEN 'Event in 1 Week! 🎵'
        WHEN 'event_reminder_3_days' THEN 'Event in 3 Days! 🎵'
        WHEN 'event_reminder_1_day' THEN 'Event Tomorrow! 🎵'
        ELSE 'Event Reminder'
      END,
      '"' || event_record.title || '" at ' || event_record.venue_name || 
      CASE reminder_type
        WHEN 'event_reminder_1_week' THEN ' is in 1 week!'
        WHEN 'event_reminder_3_days' THEN ' is in 3 days!'
        WHEN 'event_reminder_1_day' THEN ' is tomorrow!'
        ELSE ''
      END,
      jsonb_build_object(
        'event_id', event_record.id,
        'event_title', event_record.title,
        'event_venue', event_record.venue_name,
        'event_date', event_record.event_date,
        'event_artist', event_record.artist_name,
        'reminder_type', reminder_type
      )
    )
    RETURNING id INTO notification_id;

    -- Track that we sent this reminder
    INSERT INTO public.event_reminders_sent (
      user_id,
      event_id,
      reminder_type,
      notification_id
    ) VALUES (
      interest_record.user_id,
      event_record.id,
      reminder_type,
      notification_id
    );

    notification_count := notification_count + 1;
  END LOOP;

  -- Now handle "day after" reminders for past events
  FOR interest_record IN
    SELECT 
      uer.user_id,
      uer.event_id
    FROM public.user_event_relationships uer
    WHERE uer.relationship_type IN ('interested', 'going', 'maybe')
  LOOP
    -- Get event details for events that happened yesterday
    SELECT 
      e.id,
      e.title,
      COALESCE(
        (SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
        e.venue_city || ', ' || e.venue_state,
        'Unknown Venue'
      ) as venue_name,
      e.event_date,
      COALESCE(
        (SELECT a.name FROM public.artists a WHERE a.id = e.artist_id),
        ''
      ) as artist_name
    INTO event_record
    FROM public.events e
    WHERE e.id = interest_record.event_id
      AND e.event_date >= (now() - interval '2 days')
      AND e.event_date < (now() - interval '1 day');  -- Happened yesterday

    -- Skip if event not found
    CONTINUE WHEN event_record IS NULL;

    reminder_type := 'event_reminder_day_after';

    -- Check if this reminder has already been sent
    IF EXISTS (
      SELECT 1 FROM public.event_reminders_sent
      WHERE user_id = interest_record.user_id
        AND event_id = interest_record.event_id
        AND reminder_type = reminder_type
    ) THEN
      CONTINUE;
    END IF;

    -- Check if user has already reviewed this event
    IF EXISTS (
      SELECT 1 FROM public.user_reviews
      WHERE user_id = interest_record.user_id
        AND event_id = interest_record.event_id
    ) THEN
      CONTINUE;
    END IF;

    -- Create the notification
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      interest_record.user_id,
      reminder_type,
      'How was the event? ⭐',
      'You were interested in "' || event_record.title || '" at ' || event_record.venue_name || '. How was it?',
      jsonb_build_object(
        'event_id', event_record.id,
        'event_title', event_record.title,
        'event_venue', event_record.venue_name,
        'event_date', event_record.event_date,
        'event_artist', event_record.artist_name,
        'reminder_type', reminder_type
      )
    )
    RETURNING id INTO notification_id;

    -- Track that we sent this reminder
    INSERT INTO public.event_reminders_sent (
      user_id,
      event_id,
      reminder_type,
      notification_id
    ) VALUES (
      interest_record.user_id,
      event_record.id,
      reminder_type,
      notification_id
    );

    notification_count := notification_count + 1;
  END LOOP;

  -- Return results
  RETURN QUERY SELECT notification_count, reminder_summary;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.send_event_reminders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_event_reminders() TO service_role;

COMMENT ON FUNCTION public.send_event_reminders() IS 
  'Sends event reminder notifications: 1 week, 3 days, 1 day before, and day after. Should be called via cron job daily.';

-- ============================================
-- COMMENTS AND DOCUMENTATION
-- ============================================

COMMENT ON TABLE public.event_reminders_sent IS 
  'Tracks which event reminder notifications have been sent to prevent duplicates';

COMMENT ON TRIGGER notify_friend_request_trigger ON public.user_relationships IS 
  'Creates notifications when users receive friend requests';

COMMENT ON TRIGGER notify_chat_message_trigger ON public.messages IS 
  'Creates notifications when users receive chat messages with sender name and content';

COMMENT ON TRIGGER notify_friend_event_interest_trigger ON public.user_event_relationships IS 
  'Creates notifications when friends express interest in events';

COMMENT ON TRIGGER trigger_notify_artist_followers_new_event ON public.events IS 
  'Creates notifications when artists users follow have new events';

COMMENT ON TRIGGER trigger_notify_venue_followers_new_event ON public.events IS 
  'Creates notifications when venues users follow have new events';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
SELECT 'All 5 notification types implemented successfully!' as status;

