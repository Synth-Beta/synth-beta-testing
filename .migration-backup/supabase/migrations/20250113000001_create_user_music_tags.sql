-- Create user_music_tags table for manual and Spotify-synced music preferences
-- This serves as a backup personalization method when Spotify is not connected

CREATE TABLE IF NOT EXISTS public.user_music_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('genre', 'artist')),
  tag_value TEXT NOT NULL,
  tag_source TEXT NOT NULL DEFAULT 'manual' CHECK (tag_source IN ('manual', 'spotify')),
  weight INTEGER NOT NULL DEFAULT 5 CHECK (weight >= 1 AND weight <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one tag per user per type per value
  UNIQUE(user_id, tag_type, tag_value)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_music_tags_user_id ON public.user_music_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_music_tags_tag_type ON public.user_music_tags(tag_type);
CREATE INDEX IF NOT EXISTS idx_user_music_tags_tag_source ON public.user_music_tags(tag_source);
CREATE INDEX IF NOT EXISTS idx_user_music_tags_weight ON public.user_music_tags(weight DESC);

-- Enable Row Level Security
ALTER TABLE public.user_music_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own music tags
DROP POLICY IF EXISTS "Users can view their own music tags" ON public.user_music_tags;
CREATE POLICY "Users can view their own music tags" 
ON public.user_music_tags FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own music tags" ON public.user_music_tags;
CREATE POLICY "Users can insert their own music tags" 
ON public.user_music_tags FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own music tags" ON public.user_music_tags;
CREATE POLICY "Users can update their own music tags" 
ON public.user_music_tags FOR UPDATE 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own music tags" ON public.user_music_tags;
CREATE POLICY "Users can delete their own music tags" 
ON public.user_music_tags FOR DELETE 
USING (auth.uid() = user_id);

-- Add helpful comments
COMMENT ON TABLE public.user_music_tags IS 'Stores user music preferences (genres and artists) from manual input or Spotify sync';
COMMENT ON COLUMN public.user_music_tags.tag_type IS 'Type of tag: genre or artist';
COMMENT ON COLUMN public.user_music_tags.tag_value IS 'The actual genre name or artist name';
COMMENT ON COLUMN public.user_music_tags.tag_source IS 'Source of the tag: manual input or Spotify sync';
COMMENT ON COLUMN public.user_music_tags.weight IS 'Importance ranking (1-10), higher weights get priority in recommendations';

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_music_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
DROP TRIGGER IF EXISTS trigger_user_music_tags_updated_at ON public.user_music_tags;
CREATE TRIGGER trigger_user_music_tags_updated_at
  BEFORE UPDATE ON public.user_music_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_music_tags_updated_at();

