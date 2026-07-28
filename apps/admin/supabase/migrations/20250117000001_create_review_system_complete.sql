-- Complete review system migration
-- This migration creates all necessary tables, functions, and views for the review system

-- Create user_reviews table for concert/event reviews (UI-friendly structure)
CREATE TABLE IF NOT EXISTS public.user_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  
  -- Core Rating & Reaction (UI-Friendly)
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5), -- Star rating 1-5
  reaction_emoji TEXT, -- Optional emoji reaction (e.g., "🔥", "😍", "🤘")
  review_text TEXT, -- Short text review (1-3 sentences max)
  
  -- Media
  photos TEXT[], -- Array of photo URLs (1-5 recommended)
  videos TEXT[], -- Array of video URLs (optional)
  
  -- Tags / Context (UI-Friendly)
  mood_tags TEXT[], -- Mood/vibe tags: "lit", "chill", "crowded", "intimate", "wild"
  genre_tags TEXT[], -- Genre tags: "rock", "EDM", "jazz", "indie", "hip-hop"
  context_tags TEXT[], -- Context tags: "first-time", "anniversary", "birthday", "date-night"
  
  -- Social / Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  
  -- Privacy & Metadata
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, event_id) -- One review per user per event
);

-- Create supporting tables for social engagement

-- Review likes table
CREATE TABLE IF NOT EXISTS public.review_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.user_reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, review_id) -- One like per user per review
);

-- Review comments table (threaded comments)
CREATE TABLE IF NOT EXISTS public.review_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.user_reviews(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.review_comments(id) ON DELETE CASCADE, -- For threading
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Review shares table
CREATE TABLE IF NOT EXISTS public.review_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.user_reviews(id) ON DELETE CASCADE,
  share_platform TEXT, -- 'facebook', 'twitter', 'instagram', 'copy_link', etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_id ON public.user_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_event_id ON public.user_reviews(event_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_rating ON public.user_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_created_at ON public.user_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reviews_public ON public.user_reviews(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_user_reviews_mood_tags ON public.user_reviews USING GIN(mood_tags);
CREATE INDEX IF NOT EXISTS idx_user_reviews_genre_tags ON public.user_reviews USING GIN(genre_tags);

-- Indexes for social engagement tables
CREATE INDEX IF NOT EXISTS idx_review_likes_user_id ON public.review_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_review_likes_review_id ON public.review_likes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_review_id ON public.review_comments(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_parent_id ON public.review_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_review_shares_review_id ON public.review_shares(review_id);

-- Enable RLS on all tables
ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_shares ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view all public reviews
CREATE POLICY "Public reviews are viewable by everyone" 
ON public.user_reviews 
FOR SELECT 
USING (is_public = true);

-- Users can view their own reviews (even if private)
CREATE POLICY "Users can view their own reviews" 
ON public.user_reviews 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own reviews
CREATE POLICY "Users can create their own reviews" 
ON public.user_reviews 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own reviews
CREATE POLICY "Users can update their own reviews" 
ON public.user_reviews 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews" 
ON public.user_reviews 
FOR DELETE 
USING (auth.uid() = user_id);

-- Review likes policies
CREATE POLICY "Users can view review likes" ON public.review_likes FOR SELECT USING (true);
CREATE POLICY "Users can create their own review likes" ON public.review_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own review likes" ON public.review_likes FOR DELETE USING (auth.uid() = user_id);

-- Review comments policies
CREATE POLICY "Users can view review comments" ON public.review_comments FOR SELECT USING (true);
CREATE POLICY "Users can create their own review comments" ON public.review_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own review comments" ON public.review_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own review comments" ON public.review_comments FOR DELETE USING (auth.uid() = user_id);

-- Review shares policies
CREATE POLICY "Users can view review shares" ON public.review_shares FOR SELECT USING (true);
CREATE POLICY "Users can create their own review shares" ON public.review_shares FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_reviews_updated_at
    BEFORE UPDATE ON public.user_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_review_comments_updated_at
    BEFORE UPDATE ON public.review_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

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

-- Create the corrected view for public reviews with user profile information
CREATE OR REPLACE VIEW public.public_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.rating,
    ur.reaction_emoji,
    ur.review_text,
    ur.photos,
    ur.videos,
    ur.mood_tags,
    ur.genre_tags,
    ur.context_tags,
    ur.likes_count,
    ur.comments_count,
    ur.shares_count,
    ur.created_at,
    ur.updated_at,
    p.name as reviewer_name,
    p.avatar_url as reviewer_avatar,
    je.title as event_title,
    je.artist_name,
    je.venue_name,
    je.event_date
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
JOIN public.jambase_events je ON ur.event_id = je.id
WHERE ur.is_public = true;

-- Grant access to the view
GRANT SELECT ON public.public_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.public_reviews_with_profiles TO anon;
