-- ============================================
-- CREATE PASSPORT_ACHIEVEMENTS TABLE
-- Behavioral achievements (not volume-based)
-- ============================================

CREATE TABLE IF NOT EXISTS public.passport_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL CHECK (achievement_type IN (
    'first_time_city',
    'deep_cut_reviewer',
    'scene_connector',
    'trusted_taste'
  )),
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_id, achievement_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_passport_achievements_user_id 
  ON public.passport_achievements(user_id);

CREATE INDEX IF NOT EXISTS idx_passport_achievements_type 
  ON public.passport_achievements(achievement_type);

CREATE INDEX IF NOT EXISTS idx_passport_achievements_unlocked_at 
  ON public.passport_achievements(user_id, unlocked_at DESC);

CREATE INDEX IF NOT EXISTS idx_passport_achievements_metadata 
  ON public.passport_achievements USING GIN(metadata);

-- Enable RLS
ALTER TABLE public.passport_achievements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own passport achievements" ON public.passport_achievements;
DROP POLICY IF EXISTS "Users can view public passport achievements" ON public.passport_achievements;

CREATE POLICY "Users can view their own passport achievements"
  ON public.passport_achievements
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow viewing other users' achievements if their profile is public
CREATE POLICY "Users can view public passport achievements"
  ON public.passport_achievements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = passport_achievements.user_id
      AND users.is_public_profile = true
    )
  );

-- Grant permissions (inserts/updates done via functions, not directly by users)
GRANT SELECT ON public.passport_achievements TO authenticated;

-- Add comments
COMMENT ON TABLE public.passport_achievements IS 'Behavioral achievements that signal taste, curiosity, or contribution';
COMMENT ON COLUMN public.passport_achievements.achievement_type IS 'Type of behavioral achievement (not volume-based)';
COMMENT ON COLUMN public.passport_achievements.metadata IS 'Additional context about the achievement (e.g., city name for first_time_city)';

