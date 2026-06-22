-- ============================================================
-- FIX USER_SCENE_PROGRESS: Ensure genres_experienced column exists
-- ============================================================
-- This migration ensures the genres_experienced column exists in user_scene_progress
-- The calculate_scene_progress function requires this column but it may be missing
-- from the database schema, causing errors when reviews are submitted

-- Add genres_experienced column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_scene_progress' 
    AND column_name = 'genres_experienced'
  ) THEN
    ALTER TABLE public.user_scene_progress 
    ADD COLUMN genres_experienced INTEGER DEFAULT 0;
    
    RAISE NOTICE 'Added genres_experienced column to user_scene_progress table';
  ELSE
    RAISE NOTICE 'genres_experienced column already exists in user_scene_progress table';
  END IF;
END $$;

-- Ensure the column has a default value for existing rows
UPDATE public.user_scene_progress 
SET genres_experienced = 0 
WHERE genres_experienced IS NULL;

-- Add a comment to document the column
COMMENT ON COLUMN public.user_scene_progress.genres_experienced IS 
  'Number of unique genres from this scene that the user has experienced (via reviews)';

