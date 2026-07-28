-- Create function to increment review counts
CREATE OR REPLACE FUNCTION public.increment_review_count(
  review_id UUID,
  column_name TEXT,
  delta INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format('UPDATE public.user_reviews SET %I = %I + %s WHERE id = %L', 
    column_name, column_name, delta, review_id);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.increment_review_count TO authenticated;

-- Create function to update review counts when likes/comments/shares are added/removed
CREATE OR REPLACE FUNCTION public.update_review_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment count when new like/comment/share is added
    IF TG_TABLE_NAME = 'review_likes' THEN
      UPDATE public.user_reviews 
      SET likes_count = likes_count + 1 
      WHERE id = NEW.review_id;
    ELSIF TG_TABLE_NAME = 'review_comments' THEN
      UPDATE public.user_reviews 
      SET comments_count = comments_count + 1 
      WHERE id = NEW.review_id;
    ELSIF TG_TABLE_NAME = 'review_shares' THEN
      UPDATE public.user_reviews 
      SET shares_count = shares_count + 1 
      WHERE id = NEW.review_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement count when like/comment/share is removed
    IF TG_TABLE_NAME = 'review_likes' THEN
      UPDATE public.user_reviews 
      SET likes_count = GREATEST(likes_count - 1, 0) 
      WHERE id = OLD.review_id;
    ELSIF TG_TABLE_NAME = 'review_comments' THEN
      UPDATE public.user_reviews 
      SET comments_count = GREATEST(comments_count - 1, 0) 
      WHERE id = OLD.review_id;
    ELSIF TG_TABLE_NAME = 'review_shares' THEN
      UPDATE public.user_reviews 
      SET shares_count = GREATEST(shares_count - 1, 0) 
      WHERE id = OLD.review_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create triggers to automatically update counts
CREATE TRIGGER update_review_likes_count
  AFTER INSERT OR DELETE ON public.review_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_comments_count
  AFTER INSERT OR DELETE ON public.review_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_shares_count
  AFTER INSERT OR DELETE ON public.review_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();
