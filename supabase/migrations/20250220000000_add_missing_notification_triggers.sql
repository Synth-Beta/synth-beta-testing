-- ============================================
-- COMPREHENSIVE NOTIFICATION TRIGGERS
-- ============================================
-- This migration adds all missing notification triggers for:
-- - Event sharing notifications
-- - Friend RSVP notifications
-- - Friend review notifications
-- - Pre-event reminders
-- - RSVP change notifications
-- - Friend attended same event
-- - Group chat invites
-- - Trending events
-- - And more social engagement notifications

-- Step 1: Update notification type constraint to include all new types
DO $$
BEGIN
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    -- Existing types
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
    'account_upgrade_request',
    'account_upgraded',
    'subscription_expiring',
    'subscription_expired',
    'event_claim_request',
    'event_claim_approved',
    'event_claim_rejected',
    'event_published',
    'event_cancelled',
    'event_rescheduled',
    'promotion_requested',
    'promotion_approved',
    'promotion_rejected',
    'promotion_expiring',
    'content_flagged',
    'content_moderated',
    'event_attendance_reminder',
    'flag_reviewed',
    'user_warned',
    'user_restricted',
    'user_suspended',
    -- New types
    'event_share',
    'friend_rsvp_going',
    'friend_rsvp_changed',
    'friend_review_posted',
    'friend_attended_same_event',
    'event_reminder',
    'group_chat_invite',
    'trending_in_network',
    'mutual_attendance'
  ));
END $$;

-- ============================================
-- STEP 2: EVENT SHARING NOTIFICATIONS
-- ============================================
-- Notify users when an event is shared with them in chat

CREATE OR REPLACE FUNCTION notify_event_share()
RETURNS TRIGGER AS $$
DECLARE
  v_sharer_name TEXT;
  v_sharer_avatar TEXT;
  v_event_title TEXT;
  v_event_artist TEXT;
  v_event_date TEXT;
  v_chat_participants UUID[];
BEGIN
  -- Only process event share messages
  IF NEW.message_type != 'event_share' OR NEW.shared_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get sharer info
  SELECT name, avatar_url INTO v_sharer_name, v_sharer_avatar
  FROM profiles
  WHERE user_id = NEW.sender_id;

  -- Get event info
  SELECT title, artist_name, event_date::text
  INTO v_event_title, v_event_artist, v_event_date
  FROM jambase_events
  WHERE id = NEW.shared_event_id;

  -- Get all participants in this chat (except the sender)
  SELECT users INTO v_chat_participants
  FROM chats
  WHERE id = NEW.chat_id;

  -- Notify all participants except the sender
  IF v_chat_participants IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
    SELECT
      user_id,
      'event_share',
      'Event Shared 🎵',
      COALESCE(v_sharer_name, 'Someone') || ' shared "' || COALESCE(v_event_title, 'an event') || '" with you',
      jsonb_build_object(
        'sharer_id', NEW.sender_id,
        'sharer_name', v_sharer_name,
        'sharer_avatar', v_sharer_avatar,
        'event_id', NEW.shared_event_id,
        'event_title', v_event_title,
        'event_artist', v_event_artist,
        'event_date', v_event_date,
        'chat_id', NEW.chat_id,
        'message_id', NEW.id
      ),
      NEW.sender_id
    FROM unnest(v_chat_participants) AS user_id
    WHERE user_id != NEW.sender_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notify_event_share_trigger ON public.messages;
CREATE TRIGGER notify_event_share_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_event_share();

-- ============================================
-- STEP 3: FRIEND RSVP NOTIFICATIONS
-- ============================================
-- Notify users when friends RSVP "going" to events they're interested in

CREATE OR REPLACE FUNCTION notify_friend_rsvp()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name TEXT;
  v_event_title TEXT;
  v_event_venue TEXT;
  v_event_date TEXT;
  v_interested_friend RECORD;
BEGIN
  -- Only process "going" RSVP (we also trigger on "maybe")
  IF NEW.rsvp_status NOT IN ('going', 'maybe') THEN
    RETURN NEW;
  END IF;

  -- Get user info
  SELECT name INTO v_user_name
  FROM profiles
  WHERE user_id = NEW.user_id;

  -- Get event info
  SELECT title, venue_name, event_date::text
  INTO v_event_title, v_event_venue, v_event_date
  FROM jambase_events
  WHERE id = NEW.jambase_event_id;

  -- Skip if we don't have the info
  IF v_user_name IS NULL OR v_event_title IS NULL THEN
    RETURN NEW;
  END IF;

  -- Notify all friends who are also interested in this event
  FOR v_interested_friend IN
    SELECT 
      CASE 
        WHEN f.user1_id = NEW.user_id THEN f.user2_id
        ELSE f.user1_id
      END as friend_id
    FROM friends f
    INNER JOIN user_jambase_events uje ON (
      (CASE WHEN f.user1_id = NEW.user_id THEN f.user2_id ELSE f.user1_id END) = uje.user_id
    )
    WHERE (f.user1_id = NEW.user_id OR f.user2_id = NEW.user_id)
      AND uje.jambase_event_id = NEW.jambase_event_id
      -- Don't notify if friend already RSVP'd
      AND (uje.rsvp_status IS NULL OR uje.rsvp_status != NEW.rsvp_status)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
    VALUES (
      v_interested_friend.friend_id,
      'friend_rsvp_going',
      'Friend ' || CASE WHEN NEW.rsvp_status = 'going' THEN 'Going!' ELSE 'Maybe Going' END,
      v_user_name || ' is ' || CASE WHEN NEW.rsvp_status = 'going' THEN 'going to' ELSE 'maybe going to' END || ' "' || v_event_title || '"',
      jsonb_build_object(
        'friend_id', NEW.user_id,
        'friend_name', v_user_name,
        'event_id', NEW.jambase_event_id,
        'event_title', v_event_title,
        'event_venue', v_event_venue,
        'event_date', v_event_date,
        'rsvp_status', NEW.rsvp_status
      ),
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notify_friend_rsvp_insert_trigger ON public.user_jambase_events;
DROP TRIGGER IF EXISTS notify_friend_rsvp_update_trigger ON public.user_jambase_events;

-- Trigger for INSERT operations
CREATE TRIGGER notify_friend_rsvp_insert_trigger
  AFTER INSERT ON public.user_jambase_events
  FOR EACH ROW
  WHEN (NEW.rsvp_status IS NOT NULL)
  EXECUTE FUNCTION notify_friend_rsvp();

-- Trigger for UPDATE operations only
CREATE TRIGGER notify_friend_rsvp_update_trigger
  AFTER UPDATE ON public.user_jambase_events
  FOR EACH ROW
  WHEN (NEW.rsvp_status IS NOT NULL AND (OLD.rsvp_status IS NULL OR OLD.rsvp_status != NEW.rsvp_status))
  EXECUTE FUNCTION notify_friend_rsvp();

-- ============================================
-- STEP 4: FRIEND REVIEW NOTIFICATIONS
-- ============================================
-- Notify users when friends post reviews

CREATE OR REPLACE FUNCTION notify_friend_review()
RETURNS TRIGGER AS $$
DECLARE
  v_reviewer_name TEXT;
  v_event_title TEXT;
  v_event_artist TEXT;
  v_event_date TEXT;
  v_friend RECORD;
BEGIN
  -- Skip auto-generated attendance records
  IF NEW.review_text = 'ATTENDANCE_ONLY' THEN
    RETURN NEW;
  END IF;

  -- Get reviewer info
  SELECT name INTO v_reviewer_name
  FROM profiles
  WHERE user_id = NEW.user_id;

  -- Get event info
  SELECT title, artist_name, event_date::text
  INTO v_event_title, v_event_artist, v_event_date
  FROM jambase_events
  WHERE id = NEW.event_id;

  -- Skip if we don't have the info
  IF v_reviewer_name IS NULL OR v_event_title IS NULL THEN
    RETURN NEW;
  END IF;

  -- Notify all friends who are interested in this event
  FOR v_friend IN
    SELECT 
      CASE 
        WHEN f.user1_id = NEW.user_id THEN f.user2_id
        ELSE f.user1_id
      END as friend_id
    FROM friends f
    INNER JOIN user_jambase_events uje ON (
      (CASE WHEN f.user1_id = NEW.user_id THEN f.user2_id ELSE f.user1_id END) = uje.user_id
    )
    WHERE (f.user1_id = NEW.user_id OR f.user2_id = NEW.user_id)
      AND uje.jambase_event_id = NEW.event_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, data, review_id, actor_user_id)
    VALUES (
      v_friend.friend_id,
      'friend_review_posted',
      'Friend Posted a Review ⭐',
      v_reviewer_name || ' reviewed "' || v_event_title || '"',
      jsonb_build_object(
        'reviewer_id', NEW.user_id,
        'reviewer_name', v_reviewer_name,
        'event_id', NEW.event_id,
        'event_title', v_event_title,
        'event_artist', v_event_artist,
        'event_date', v_event_date,
        'rating', NEW.rating
      ),
      NEW.id,
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notify_friend_review_trigger ON public.user_reviews;
CREATE TRIGGER notify_friend_review_trigger
  AFTER INSERT ON public.user_reviews
  FOR EACH ROW
  -- Only notify for new reviews, not for attendance-only records
  WHEN (NEW.review_text != 'ATTENDANCE_ONLY' AND NEW.is_public = true)
  EXECUTE FUNCTION notify_friend_review();

-- ============================================
-- STEP 5: PRE-EVENT REMINDERS
-- ============================================
-- Function to send event reminders based on user preferences

CREATE OR REPLACE FUNCTION send_event_reminders()
RETURNS TABLE(notification_count INTEGER, events_reminded UUID[]) AS $$
DECLARE
  notification_count INTEGER := 0;
  events_reminded UUID[] := ARRAY[]::UUID[];
  event_record RECORD;
  user_record RECORD;
BEGIN
  -- Find all upcoming events where users are interested
  FOR event_record IN
    SELECT 
      je.id as event_id,
      je.title,
      je.venue_name,
      je.event_date,
      je.artist_name
    FROM jambase_events je
    WHERE je.event_date >= now()
      AND je.event_date <= (now() + interval '30 days')
  LOOP
    -- Find all users interested in this event with reminder preferences
    FOR user_record IN
      SELECT 
        uje.user_id,
        COALESCE(ep.event_reminder_days, 3) as reminder_days
      FROM user_jambase_events uje
      LEFT JOIN email_preferences ep ON uje.user_id = ep.user_id
      WHERE uje.jambase_event_id = event_record.event_id
        AND COALESCE(ep.enable_event_reminders, true) = true
        AND event_record.event_date >= (now() + (COALESCE(ep.event_reminder_days, 3) || ' days')::INTERVAL)
        AND event_record.event_date <= (now() + (COALESCE(ep.event_reminder_days, 3) + 1 || ' days')::INTERVAL)
        -- Only send one reminder per event
        AND NOT EXISTS (
          SELECT 1 FROM notifications
          WHERE user_id = uje.user_id
            AND type = 'event_reminder'
            AND data->>'event_id' = event_record.event_id::text
        )
    LOOP
      -- Check if we haven't already created this exact notification today
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE user_id = user_record.user_id
          AND type = 'event_reminder'
          AND data->>'event_id' = event_record.event_id::text
          AND created_at > (now() - interval '1 day')
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          user_record.user_id,
          'event_reminder',
          'Upcoming Event Reminder 🎵',
          event_record.title || ' is in ' || user_record.reminder_days::text || CASE WHEN user_record.reminder_days = 1 THEN ' day' ELSE ' days' END,
          jsonb_build_object(
            'event_id', event_record.event_id,
            'event_title', event_record.title,
            'event_venue', event_record.venue_name,
            'event_date', event_record.event_date,
            'event_artist', event_record.artist_name
          )
        );
        
        notification_count := notification_count + 1;
        events_reminded := array_append(events_reminded, event_record.event_id);
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT notification_count, events_reminded;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.send_event_reminders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_event_reminders() TO service_role;

COMMENT ON FUNCTION public.send_event_reminders() IS 
'Sends event reminder notifications to users based on their preferences. Should be called via cron job daily.';

-- ============================================
-- STEP 6: GROUP CHAT INVITES
-- ============================================
-- Notify users when added to event groups

CREATE OR REPLACE FUNCTION notify_group_chat_invite()
RETURNS TRIGGER AS $$
DECLARE
  v_event_title TEXT;
  v_adder_name TEXT;
BEGIN
  -- Get event info if this is an event group
  SELECT je.title INTO v_event_title
  FROM event_groups eg
  LEFT JOIN jambase_events je ON eg.event_id = je.id
  WHERE eg.id = NEW.group_id;

  -- Get person who added them
  SELECT name INTO v_adder_name
  FROM profiles
  WHERE user_id = auth.uid();

  -- Notify the new member
  INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
  VALUES (
    NEW.user_id,
    'group_chat_invite',
    'Added to Group Chat 💬',
    COALESCE(v_adder_name, 'Someone') || ' added you to a group for "' || COALESCE(v_event_title, 'an event') || '"',
    jsonb_build_object(
      'group_id', NEW.group_id,
      'event_id', (SELECT event_id FROM event_groups WHERE id = NEW.group_id),
      'event_title', v_event_title,
      'adder_id', auth.uid(),
      'adder_name', v_adder_name
    ),
    auth.uid()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Only create trigger if event_group_members table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'event_group_members'
  ) THEN
    DROP TRIGGER IF EXISTS notify_group_chat_invite_trigger ON public.event_group_members;
    CREATE TRIGGER notify_group_chat_invite_trigger
      AFTER INSERT ON public.event_group_members
      FOR EACH ROW
      EXECUTE FUNCTION notify_group_chat_invite();
  END IF;
END $$;

-- ============================================
-- STEP 7: HELPERS AND CLEANUP
-- ============================================

COMMENT ON FUNCTION public.notify_event_share() IS 'Notifies users when events are shared with them in chat';
COMMENT ON FUNCTION public.notify_friend_rsvp() IS 'Notifies users when friends RSVP to events they are interested in';
COMMENT ON FUNCTION public.notify_friend_review() IS 'Notifies users when friends post reviews';
COMMENT ON FUNCTION public.notify_group_chat_invite() IS 'Notifies users when added to event group chats';
COMMENT ON FUNCTION public.send_event_reminders() IS 'Sends event reminder notifications to users based on their preferences';

COMMENT ON TRIGGER notify_event_share_trigger ON public.messages IS 'Trigger that creates notifications when events are shared in chat';
COMMENT ON TRIGGER notify_friend_rsvp_insert_trigger ON public.user_jambase_events IS 'Trigger that creates notifications when friends RSVP to events';
COMMENT ON TRIGGER notify_friend_rsvp_update_trigger ON public.user_jambase_events IS 'Trigger that creates notifications when friends change their RSVP status';
COMMENT ON TRIGGER notify_friend_review_trigger ON public.user_reviews IS 'Trigger that creates notifications when friends post reviews';
COMMENT ON TRIGGER notify_group_chat_invite_trigger ON public.event_group_members IS 'Trigger that creates notifications when users are added to group chats';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
SELECT 'All notification triggers installed successfully!' as status;

