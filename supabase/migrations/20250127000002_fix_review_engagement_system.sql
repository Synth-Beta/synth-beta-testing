-- Fix Review Engagement System
-- This migration ensures likes, comments, and notifications work properly

-- First, ensure all tables exist and have proper structure
CREATE TABLE IF NOT EXISTS public.review_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.user_reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, review_id)
);

CREATE TABLE IF NOT EXISTS public.review_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.user_reviews(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.review_comments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ensure user_reviews has the count columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'likes_count') THEN
    ALTER TABLE public.user_reviews ADD COLUMN likes_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'comments_count') THEN
    ALTER TABLE public.user_reviews ADD COLUMN comments_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'shares_count') THEN
    ALTER TABLE public.user_reviews ADD COLUMN shares_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_review_likes_user_id ON public.review_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_review_likes_review_id ON public.review_likes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_review_id ON public.review_comments(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_parent_id ON public.review_comments(parent_comment_id);

-- Enable RLS
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view review likes" ON public.review_likes;
CREATE POLICY "Users can view review likes" ON public.review_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create their own review likes" ON public.review_likes;
CREATE POLICY "Users can create their own review likes" ON public.review_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own review likes" ON public.review_likes;
CREATE POLICY "Users can delete their own review likes" ON public.review_likes FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view review comments" ON public.review_comments;
CREATE POLICY "Users can view review comments" ON public.review_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create their own review comments" ON public.review_comments;
CREATE POLICY "Users can create their own review comments" ON public.review_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own review comments" ON public.review_comments;
CREATE POLICY "Users can update their own review comments" ON public.review_comments FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own review comments" ON public.review_comments;
CREATE POLICY "Users can delete their own review comments" ON public.review_comments FOR DELETE USING (auth.uid() = user_id);

-- Create or replace the function to update review counts
CREATE OR REPLACE FUNCTION public.update_review_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment count when new like/comment is added
    IF TG_TABLE_NAME = 'review_likes' THEN
      UPDATE public.user_reviews 
      SET likes_count = COALESCE(likes_count, 0) + 1 
      WHERE id = NEW.review_id;
    ELSIF TG_TABLE_NAME = 'review_comments' THEN
      UPDATE public.user_reviews 
      SET comments_count = COALESCE(comments_count, 0) + 1 
      WHERE id = NEW.review_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement count when like/comment is removed
    IF TG_TABLE_NAME = 'review_likes' THEN
      UPDATE public.user_reviews 
      SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
      WHERE id = OLD.review_id;
    ELSIF TG_TABLE_NAME = 'review_comments' THEN
      UPDATE public.user_reviews 
      SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
      WHERE id = OLD.review_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Drop existing triggers and recreate them
DROP TRIGGER IF EXISTS update_review_likes_count ON public.review_likes;
CREATE TRIGGER update_review_likes_count
  AFTER INSERT OR DELETE ON public.review_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

DROP TRIGGER IF EXISTS update_review_comments_count ON public.review_comments;
CREATE TRIGGER update_review_comments_count
  AFTER INSERT OR DELETE ON public.review_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

-- Create notification triggers
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

-- Create notification triggers
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

-- Create a function to get review engagement data
CREATE OR REPLACE FUNCTION public.get_review_engagement(
  review_id_param UUID,
  user_id_param UUID DEFAULT NULL
)
RETURNS TABLE (
  likes_count INTEGER,
  comments_count INTEGER,
  shares_count INTEGER,
  is_liked_by_user BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(ur.likes_count, 0)::INTEGER,
    COALESCE(ur.comments_count, 0)::INTEGER,
    COALESCE(ur.shares_count, 0)::INTEGER,
    CASE 
      WHEN user_id_param IS NULL THEN false
      ELSE EXISTS(
        SELECT 1 FROM public.review_likes rl 
        WHERE rl.review_id = review_id_param AND rl.user_id = user_id_param
      )
    END
  FROM public.user_reviews ur
  WHERE ur.id = review_id_param;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_review_engagement TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_review_counts TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_review_like_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_review_comment_notification TO authenticated;

-- Fix any existing count inconsistencies
UPDATE public.user_reviews 
SET likes_count = (
  SELECT COUNT(*) FROM public.review_likes 
  WHERE review_likes.review_id = user_reviews.id
)
WHERE likes_count IS NULL OR likes_count != (
  SELECT COUNT(*) FROM public.review_likes 
  WHERE review_likes.review_id = user_reviews.id
);

UPDATE public.user_reviews 
SET comments_count = (
  SELECT COUNT(*) FROM public.review_comments 
  WHERE review_comments.review_id = user_reviews.id
)
WHERE comments_count IS NULL OR comments_count != (
  SELECT COUNT(*) FROM public.review_comments 
  WHERE review_comments.review_id = user_reviews.id
);
