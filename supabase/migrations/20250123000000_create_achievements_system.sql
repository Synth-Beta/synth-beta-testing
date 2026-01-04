-- ============================================
-- ACHIEVEMENTS SYSTEM
-- Two tables: achievements (definitions) and user_achievement_progress (tracking)
-- ============================================

-- ============================================
-- 1. ACHIEVEMENTS TABLE - Achievement definitions
-- ============================================
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Achievement identity
  achievement_key TEXT NOT NULL UNIQUE, -- e.g., 'genre_curator', 'genre_specialist'
  name TEXT NOT NULL, -- Display name, e.g., 'Genre Curator'
  description TEXT, -- Full description of the achievement
  
  -- Tier requirements
  bronze_requirement TEXT NOT NULL, -- Description of bronze requirement
  bronze_goal INTEGER NOT NULL, -- Numeric goal for bronze (e.g., 3 genres)
  silver_requirement TEXT NOT NULL, -- Description of silver requirement
  silver_goal INTEGER NOT NULL, -- Numeric goal for silver (e.g., 5 genres)
  gold_requirement TEXT NOT NULL, -- Description of gold requirement
  gold_goal INTEGER NOT NULL, -- Numeric goal for gold (e.g., 8 genres)
  
  -- Metadata
  category TEXT, -- Optional category grouping
  icon_name TEXT, -- Icon identifier for UI
  sort_order INTEGER DEFAULT 0, -- Display order
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_achievements_key ON public.achievements(achievement_key);
CREATE INDEX IF NOT EXISTS idx_achievements_active ON public.achievements(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_achievements_sort ON public.achievements(sort_order, name);

-- ============================================
-- 2. USER_ACHIEVEMENT_PROGRESS TABLE - User progress tracking
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_achievement_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Foreign keys
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  
  -- Progress tracking
  current_progress INTEGER NOT NULL DEFAULT 0, -- Current count/value
  highest_tier_achieved TEXT CHECK (highest_tier_achieved IN ('bronze', 'silver', 'gold')),
  bronze_achieved_at TIMESTAMPTZ, -- When bronze was first achieved
  silver_achieved_at TIMESTAMPTZ, -- When silver was first achieved
  gold_achieved_at TIMESTAMPTZ, -- When gold was first achieved
  
  -- Progress metadata (for complex achievements)
  progress_metadata JSONB DEFAULT '{}'::jsonb, -- Store detailed progress data
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure one progress record per user per achievement
  UNIQUE(user_id, achievement_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_achievement_progress_user_id 
  ON public.user_achievement_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievement_progress_achievement_id 
  ON public.user_achievement_progress(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievement_progress_tier 
  ON public.user_achievement_progress(highest_tier_achieved) 
  WHERE highest_tier_achieved IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_achievement_progress_user_tier 
  ON public.user_achievement_progress(user_id, highest_tier_achieved);

-- ============================================
-- 3. INSERT ACHIEVEMENT DEFINITIONS
-- ============================================

-- Genre Curator: Attend shows in 3/5/8 genres
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'genre_curator',
  'Genre Curator',
  'Explore music across different genres',
  'Attend shows in 3 genres',
  3,
  'Attend shows in 5 genres',
  5,
  'Attend shows in 8 genres',
  8,
  'exploration',
  1
) ON CONFLICT (achievement_key) DO NOTHING;

-- Genre Specialist: Attend 5/10/20 shows in one genre
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'genre_specialist',
  'Genre Specialist',
  'Deep dive into a single genre',
  'Attend 5 shows in one genre',
  5,
  'Attend 10 shows in one genre',
  10,
  'Attend 20 shows in one genre',
  20,
  'specialization',
  2
) ON CONFLICT (achievement_key) DO NOTHING;

-- Bucket List Starter: Attend 1/3/6 "bucket list" events
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'bucket_list_starter',
  'Bucket List Starter',
  'Check off your must-see artists and venues',
  'Attend 1 "bucket list" event',
  1,
  'Attend 3 "bucket list" events',
  3,
  'Attend 6 "bucket list" events',
  6,
  'milestones',
  3
) ON CONFLICT (achievement_key) DO NOTHING;

-- Intentional Explorer: Attend shows across 3/5/7 different scenes in one genre
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'intentional_explorer',
  'Intentional Explorer',
  'Explore different scenes within a genre',
  'Attend shows across 3 different scenes in one genre',
  3,
  'Attend shows across 5 different scenes in one genre',
  5,
  'Attend shows across 7 different scenes in one genre',
  7,
  'exploration',
  4
) ON CONFLICT (achievement_key) DO NOTHING;

-- Set Break Scholar: Review with set-level detail 2/5/10 times
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'set_break_scholar',
  'Set Break Scholar',
  'Share detailed set-level or performance insights',
  'Review a show with set-level or performance detail 2 times',
  2,
  'Review a show with set-level or performance detail 5 times',
  5,
  'Review a show with set-level or performance detail 10 times',
  10,
  'content',
  5
) ON CONFLICT (achievement_key) DO NOTHING;

-- Album-to-Stage: Attend live show after engaging with studio release 1/3/6 times
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'album_to_stage',
  'Album-to-Stage',
  'Bridge the gap between studio and live',
  'Attend a live show after engaging with the studio release',
  1,
  'Do this with 3 releases',
  3,
  'Do this with 6 releases',
  6,
  'engagement',
  6
) ON CONFLICT (achievement_key) DO NOTHING;

-- Legacy Listener: Attend shows by artists active in 2/3/4 distinct decades
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'legacy_listener',
  'Legacy Listener',
  'Appreciate music across generations',
  'Attend shows by artists active in 2 distinct decades',
  2,
  'Attend shows by artists active in 3 decades',
  3,
  'Attend shows by artists active in 4 decades',
  4,
  'diversity',
  7
) ON CONFLICT (achievement_key) DO NOTHING;

-- New Blood: Attend 2/5/10 debut or early-career performances
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'new_blood',
  'New Blood',
  'Support emerging artists',
  'Attend 2 debut or early-career performances',
  2,
  'Attend 5 debut or early-career performances',
  5,
  'Attend 10 debut or early-career performances',
  10,
  'discovery',
  8
) ON CONFLICT (achievement_key) DO NOTHING;

-- Full Spectrum: Attend both acoustic and high-energy performances 1/3/5 genres
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'full_spectrum',
  'Full Spectrum',
  'Experience the full range of live music energy',
  'Attend both acoustic and high-energy performances',
  1,
  'Do this across 3 genres',
  3,
  'Do this across 5 genres',
  5,
  'diversity',
  9
) ON CONFLICT (achievement_key) DO NOTHING;

-- Return Engagement: Attend same artist across 2/3/5 different tours or eras
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'return_engagement',
  'Return Engagement',
  'Follow artists through their evolution',
  'Attend the same artist across 2 different tours or eras',
  2,
  'Attend across 3 tours or eras',
  3,
  'Attend across 5 tours or eras',
  5,
  'loyalty',
  10
) ON CONFLICT (achievement_key) DO NOTHING;

-- Festival Attendance: Attend 1/3/5 festivals
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'festival_attendance',
  'Festival Attendance',
  'Experience the magic of music festivals',
  'Attend 1 festival',
  1,
  'Attend 3 festivals',
  3,
  'Attend 5 festivals',
  5,
  'milestones',
  11
) ON CONFLICT (achievement_key) DO NOTHING;

-- Artist Devotee: See the same artist 3/5/10 times
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'artist_devotee',
  'Artist Devotee',
  'Show your dedication to your favorite artists',
  'See the same artist 3 times',
  3,
  'See the same artist 5 times',
  5,
  'See the same artist 10 times',
  10,
  'loyalty',
  12
) ON CONFLICT (achievement_key) DO NOTHING;

-- Venue Regular: Attend 5/10/20 shows at the same venue
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'venue_regular',
  'Venue Regular',
  'Become a familiar face at your favorite venues',
  'Attend 5 shows at the same venue',
  5,
  'Attend 10 shows at the same venue',
  10,
  'Attend 20 shows at the same venue',
  20,
  'loyalty',
  13
) ON CONFLICT (achievement_key) DO NOTHING;

-- Go with Friends!: Attend 2/5/10 shows with friends
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'go_with_friends',
  'Go with Friends!',
  'Share the music experience with your crew',
  'Attend 2 shows with friends',
  2,
  'Attend 5 shows with friends',
  5,
  'Attend 10 shows with friends',
  10,
  'social',
  14
) ON CONFLICT (achievement_key) DO NOTHING;

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================

-- Achievements table: Public read, admin write
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view achievements"
  ON public.achievements
  FOR SELECT
  USING (true);

-- User achievement progress: Users can view their own, public can view others' achievements
ALTER TABLE public.user_achievement_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own achievement progress"
  ON public.user_achievement_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view achievement progress (for leaderboards)"
  ON public.user_achievement_progress
  FOR SELECT
  USING (true);

-- ============================================
-- 5. COMMENTS
-- ============================================

COMMENT ON TABLE public.achievements IS 'Achievement definitions with bronze/silver/gold tiers';
COMMENT ON TABLE public.user_achievement_progress IS 'Tracks user progress toward achievements';
COMMENT ON COLUMN public.achievements.achievement_key IS 'Unique identifier for the achievement (e.g., genre_curator)';
COMMENT ON COLUMN public.user_achievement_progress.current_progress IS 'Current count/value toward the achievement';
COMMENT ON COLUMN public.user_achievement_progress.progress_metadata IS 'JSONB field for storing detailed progress data (e.g., which genres, which scenes, etc.)';

