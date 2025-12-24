-- Fix all database issues identified from console errors
-- Run this SQL in Supabase SQL Editor

-- ============================================
-- ISSUE 1: Add missing columns to users table
-- ============================================

-- Add missing columns to users table if they don't exist
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS dismissed_recommendations TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS location_city TEXT,
ADD COLUMN IF NOT EXISTS location_state TEXT,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tour_completed BOOLEAN DEFAULT false;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_users_location_city ON public.users(location_city);
CREATE INDEX IF NOT EXISTS idx_users_location_geo ON public.users(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================
-- ISSUE 2: Create music_preference_signals table (if missing)
-- ============================================

CREATE TABLE IF NOT EXISTS public.music_preference_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL CHECK (preference_type IN ('artist', 'genre')),
  preference_value TEXT NOT NULL,
  preference_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  genres TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, preference_type, preference_value)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_music_preference_signals_user_id ON public.music_preference_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_music_preference_signals_type ON public.music_preference_signals(preference_type);
CREATE INDEX IF NOT EXISTS idx_music_preference_signals_score ON public.music_preference_signals(preference_score DESC);

-- Enable RLS
ALTER TABLE public.music_preference_signals ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop if exists to make idempotent)
DROP POLICY IF EXISTS "Users can view their own preference signals" ON public.music_preference_signals;
DROP POLICY IF EXISTS "Users can insert their own preference signals" ON public.music_preference_signals;

CREATE POLICY "Users can view their own preference signals" ON public.music_preference_signals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preference signals" ON public.music_preference_signals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.music_preference_signals TO authenticated;

-- ============================================
-- ISSUE 3: Ensure get_user_top_artists function exists
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_top_artists(
  p_user_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  artist_name TEXT,
  artist_id UUID,
  score NUMERIC,
  interaction_count BIGINT,
  genres TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mps.preference_value::TEXT as artist_name,
    a.id as artist_id,
    mps.preference_score as score,
    mps.interaction_count::BIGINT,
    COALESCE(mps.genres, ARRAY[]::TEXT[]) as genres
  FROM public.music_preference_signals mps
  LEFT JOIN public.artists a ON a.name = mps.preference_value
  WHERE mps.user_id = p_user_id
    AND mps.preference_type = 'artist'
  ORDER BY mps.preference_score DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_top_artists(UUID, INT) TO authenticated;

-- ============================================
-- ISSUE 4: Ensure venue_rating_decimal column exists in reviews table
-- ============================================

-- First, check what rating columns exist and add venue_rating_decimal if missing
DO $$
BEGIN
  -- Check if venue_rating_decimal exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'venue_rating_decimal'
  ) THEN
    -- Add venue_rating_decimal column
    ALTER TABLE public.reviews 
    ADD COLUMN venue_rating_decimal DECIMAL(2,1) CHECK (venue_rating_decimal >= 0.5 AND venue_rating_decimal <= 5.0);
    
    -- Try to migrate from venue_rating_new if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'venue_rating_new'
    ) THEN
      UPDATE public.reviews
      SET venue_rating_decimal = venue_rating_new
      WHERE venue_rating_decimal IS NULL AND venue_rating_new IS NOT NULL;
    -- Otherwise try to migrate from venue_rating (INTEGER) if it exists
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'venue_rating'
      AND data_type = 'integer'
    ) THEN
      UPDATE public.reviews
      SET venue_rating_decimal = venue_rating::DECIMAL(2,1)
      WHERE venue_rating_decimal IS NULL AND venue_rating IS NOT NULL;
    END IF;
  END IF;
END $$;

-- Create index for venue_rating_decimal
CREATE INDEX IF NOT EXISTS idx_reviews_venue_rating_decimal ON public.reviews(venue_rating_decimal) WHERE venue_rating_decimal IS NOT NULL;

