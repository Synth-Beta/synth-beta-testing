-- Extend Notifications System for Review Engagement
-- This migration extends the existing notifications table to support
-- notifications for review likes, comments, and replies

-- First, let's extend the notifications table to support review engagement
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS review_id UUID REFERENCES public.user_reviews(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES public.review_comments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update the type constraint to include new notification types
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
  'comment_replied'
));

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_review_id ON public.notifications(review_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id ON public.notifications(comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_user_id ON public.notifications(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON public.notifications(user_id, is_read) WHERE is_read = false;

-- Function to create a review like notification
CREATE OR REPLACE FUNCTION public.create_review_like_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  review_owner_id UUID;
  review_event_title TEXT;
  actor_name TEXT;
BEGIN
  -- Get the review owner and event details
  SELECT ur.user_id, je.title
  INTO review_owner_id, review_event_title
  FROM public.user_reviews ur
  JOIN public.jambase_events je ON ur.event_id = je.id
  WHERE ur.id = NEW.review_id;

  -- Get the actor's name
  SELECT name INTO actor_name
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- Only create notification if the liker is not the review owner
  IF review_owner_id != NEW.user_id THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      review_id,
      actor_user_id
    ) VALUES (
      review_owner_id,
      'review_liked',
      'Your Review Got a Like! ❤️',
      COALESCE(actor_name, 'Someone') || ' liked your review of ' || COALESCE(review_event_title, 'a concert'),
      jsonb_build_object(
        'review_id', NEW.review_id,
        'actor_id', NEW.user_id,
        'actor_name', actor_name,
        'event_title', review_event_title
      ),
      NEW.review_id,
      NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Function to create a review comment notification
CREATE OR REPLACE FUNCTION public.create_review_comment_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  review_owner_id UUID;
  review_event_title TEXT;
  actor_name TEXT;
  comment_preview TEXT;
BEGIN
  -- Get the review owner and event details
  SELECT ur.user_id, je.title
  INTO review_owner_id, review_event_title
  FROM public.user_reviews ur
  JOIN public.jambase_events je ON ur.event_id = je.id
  WHERE ur.id = NEW.review_id;

  -- Get the actor's name
  SELECT name INTO actor_name
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- Create a preview of the comment (first 50 characters)
  comment_preview := LEFT(NEW.comment_text, 50);
  IF LENGTH(NEW.comment_text) > 50 THEN
    comment_preview := comment_preview || '...';
  END IF;

  -- Only create notification if the commenter is not the review owner
  IF review_owner_id != NEW.user_id THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      review_id,
      comment_id,
      actor_user_id
    ) VALUES (
      review_owner_id,
      'review_commented',
      'New Comment on Your Review 💬',
      COALESCE(actor_name, 'Someone') || ' commented on your review: "' || comment_preview || '"',
      jsonb_build_object(
        'review_id', NEW.review_id,
        'comment_id', NEW.id,
        'actor_id', NEW.user_id,
        'actor_name', actor_name,
        'event_title', review_event_title,
        'comment_preview', comment_preview
      ),
      NEW.review_id,
      NEW.id,
      NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Function to create a comment reply notification
CREATE OR REPLACE FUNCTION public.create_comment_reply_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_comment_user_id UUID;
  review_event_title TEXT;
  actor_name TEXT;
  comment_preview TEXT;
BEGIN
  -- Only process if this is a reply (has parent_comment_id)
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the parent comment owner
  SELECT rc.user_id, je.title
  INTO parent_comment_user_id, review_event_title
  FROM public.review_comments rc
  JOIN public.user_reviews ur ON rc.review_id = ur.id
  JOIN public.jambase_events je ON ur.event_id = je.id
  WHERE rc.id = NEW.parent_comment_id;

  -- Get the actor's name
  SELECT name INTO actor_name
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- Create a preview of the comment
  comment_preview := LEFT(NEW.comment_text, 50);
  IF LENGTH(NEW.comment_text) > 50 THEN
    comment_preview := comment_preview || '...';
  END IF;

  -- Only create notification if the replier is not the parent comment owner
  IF parent_comment_user_id != NEW.user_id THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      review_id,
      comment_id,
      actor_user_id
    ) VALUES (
      parent_comment_user_id,
      'comment_replied',
      'Reply to Your Comment 🔄',
      COALESCE(actor_name, 'Someone') || ' replied to your comment: "' || comment_preview || '"',
      jsonb_build_object(
        'review_id', (SELECT review_id FROM public.review_comments WHERE id = NEW.parent_comment_id),
        'comment_id', NEW.id,
        'parent_comment_id', NEW.parent_comment_id,
        'actor_id', NEW.user_id,
        'actor_name', actor_name,
        'event_title', review_event_title,
        'comment_preview', comment_preview
      ),
      (SELECT review_id FROM public.review_comments WHERE id = NEW.parent_comment_id),
      NEW.id,
      NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers to automatically create notifications
CREATE TRIGGER create_review_like_notification_trigger
  AFTER INSERT ON public.review_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_review_like_notification();

CREATE TRIGGER create_review_comment_notification_trigger
  AFTER INSERT ON public.review_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_review_comment_notification();

CREATE TRIGGER create_comment_reply_notification_trigger
  AFTER INSERT ON public.review_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_comment_reply_notification();

-- Update RLS policies for the new columns
-- Users can view notifications with their review/comment references
CREATE POLICY "Users can view notifications with review references" ON public.notifications 
FOR SELECT USING (
  auth.uid() = user_id OR 
  (review_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_reviews 
    WHERE id = review_id AND user_id = auth.uid()
  )) OR
  (comment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.review_comments 
    WHERE id = comment_id AND user_id = auth.uid()
  ))
);

-- Function to mark notifications as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(notification_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications 
  SET is_read = true
  WHERE id = notification_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found or access denied';
  END IF;
END;
$$;

-- Function to mark all notifications as read for a user
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications 
  SET is_read = true
  WHERE user_id = auth.uid() AND is_read = false;
END;
$$;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  count INTEGER;
BEGIN
  SELECT COUNT(*) INTO count
  FROM public.notifications
  WHERE user_id = auth.uid() AND is_read = false;
  
  RETURN COALESCE(count, 0);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count TO authenticated;

-- Add helpful comments
COMMENT ON TABLE public.notifications IS 'Extended notifications system supporting friend requests, review engagement, and comments';
COMMENT ON COLUMN public.notifications.review_id IS 'Reference to the review that triggered this notification';
COMMENT ON COLUMN public.notifications.comment_id IS 'Reference to the comment that triggered this notification';
COMMENT ON COLUMN public.notifications.actor_user_id IS 'User who performed the action that triggered this notification';

-- Create a view for easier notification queries with user details
CREATE OR REPLACE VIEW public.notifications_with_details AS
SELECT 
  n.id,
  n.user_id,
  n.type,
  n.title,
  n.message,
  n.data,
  n.is_read,
  n.created_at,
  n.review_id,
  n.comment_id,
  n.actor_user_id,
  -- Actor details
  ap.name as actor_name,
  ap.avatar_url as actor_avatar,
  -- Review/Event details (if applicable)
  je.title as event_title,
  je.artist_name,
  je.venue_name,
  ur.review_text,
  ur.rating
FROM public.notifications n
LEFT JOIN public.profiles ap ON n.actor_user_id = ap.user_id
LEFT JOIN public.user_reviews ur ON n.review_id = ur.id
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
ORDER BY n.created_at DESC;

-- Grant access to the view
GRANT SELECT ON public.notifications_with_details TO authenticated;

-- Add comment to the view
COMMENT ON VIEW public.notifications_with_details IS 'Notifications with enriched user and event details for display';
