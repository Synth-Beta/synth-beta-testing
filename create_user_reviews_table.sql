-- Create user_reviews table for concert/event reviews (UI-friendly structure)
CREATE TABLE public.user_reviews (
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
CREATE TABLE public.review_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.user_reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, review_id) -- One like per user per review
);

-- Review comments table (threaded comments)
CREATE TABLE public.review_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.user_reviews(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.review_comments(id) ON DELETE CASCADE, -- For threading
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Review shares table
CREATE TABLE public.review_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.user_reviews(id) ON DELETE CASCADE,
  share_platform TEXT, -- 'facebook', 'twitter', 'instagram', 'copy_link', etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_user_reviews_user_id ON public.user_reviews(user_id);
CREATE INDEX idx_user_reviews_event_id ON public.user_reviews(event_id);
CREATE INDEX idx_user_reviews_rating ON public.user_reviews(rating);
CREATE INDEX idx_user_reviews_created_at ON public.user_reviews(created_at DESC);
CREATE INDEX idx_user_reviews_public ON public.user_reviews(is_public) WHERE is_public = true;
CREATE INDEX idx_user_reviews_mood_tags ON public.user_reviews USING GIN(mood_tags);
CREATE INDEX idx_user_reviews_genre_tags ON public.user_reviews USING GIN(genre_tags);

-- Indexes for social engagement tables
CREATE INDEX idx_review_likes_user_id ON public.review_likes(user_id);
CREATE INDEX idx_review_likes_review_id ON public.review_likes(review_id);
CREATE INDEX idx_review_comments_review_id ON public.review_comments(review_id);
CREATE INDEX idx_review_comments_parent_id ON public.review_comments(parent_comment_id);
CREATE INDEX idx_review_shares_review_id ON public.review_shares(review_id);

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

-- Create a view for public reviews with user profile information
CREATE VIEW public.public_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.rating,
    ur.title,
    ur.review_text,
    ur.venue_rating,
    ur.sound_quality_rating,
    ur.crowd_energy_rating,
    ur.value_for_money_rating,
    ur.would_recommend,
    ur.photos,
    ur.tags,
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
