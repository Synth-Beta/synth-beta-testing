-- Quick Notifications Setup
-- Run this in Supabase SQL Editor if the main migration has issues

-- First, let's check if the notifications table exists and add columns if needed
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'review_id') THEN
    ALTER TABLE public.notifications ADD COLUMN review_id UUID REFERENCES public.user_reviews(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'comment_id') THEN
    ALTER TABLE public.notifications ADD COLUMN comment_id UUID REFERENCES public.review_comments(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'actor_user_id') THEN
    ALTER TABLE public.notifications ADD COLUMN actor_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update the type constraint to include new notification types
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'notifications_type_check') THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;
  
  -- Add new constraint
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
EXCEPTION WHEN OTHERS THEN
  -- If constraint already exists with different values, ignore
  NULL;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_notifications_review_id ON public.notifications(review_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id ON public.notifications(comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_user_id ON public.notifications(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON public.notifications(user_id, is_read) WHERE is_read = false;

-- Create the essential helper functions
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read TO authenticated;

-- Create the essential notification triggers (simplified versions)
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
  SELECT ur.user_id, COALESCE(je.title, 'Unknown Event')
  INTO review_owner_id, review_event_title
  FROM public.user_reviews ur
  LEFT JOIN public.jambase_events je ON ur.event_id = je.id
  WHERE ur.id = NEW.review_id;

  -- Get the actor's name
  SELECT COALESCE(name, 'Someone') INTO actor_name
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
      actor_name || ' liked your review of ' || review_event_title,
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
  SELECT ur.user_id, COALESCE(je.title, 'Unknown Event')
  INTO review_owner_id, review_event_title
  FROM public.user_reviews ur
  LEFT JOIN public.jambase_events je ON ur.event_id = je.id
  WHERE ur.id = NEW.review_id;

  -- Get the actor's name
  SELECT COALESCE(name, 'Someone') INTO actor_name
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
      actor_name || ' commented on your review: "' || comment_preview || '"',
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

-- Create triggers
DROP TRIGGER IF EXISTS create_review_like_notification_trigger ON public.review_likes;
CREATE TRIGGER create_review_like_notification_trigger
  AFTER INSERT ON public.review_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_review_like_notification();

DROP TRIGGER IF EXISTS create_review_comment_notification_trigger ON public.review_comments;
CREATE TRIGGER create_review_comment_notification_trigger
  AFTER INSERT ON public.review_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_review_comment_notification();

-- Create a simple view for notifications with details
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
  COALESCE(je.title, 'Unknown Event') as event_title,
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
