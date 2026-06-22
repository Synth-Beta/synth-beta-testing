-- ============================================
-- UPDATE PASSPORT_TIMELINE FOR USER MILESTONES
-- Add milestone_type and custom_reason columns
-- ============================================

-- Add new columns to passport_timeline
ALTER TABLE public.passport_timeline
  ADD COLUMN IF NOT EXISTS milestone_type TEXT CHECK (milestone_type IN (
    'first_review',
    'first_favorite_artist',
    'first_favorite_venue',
    'best_setlist',
    'special_show',
    'custom'
  )),
  ADD COLUMN IF NOT EXISTS custom_reason TEXT;

-- Update significance column to be nullable (users will use custom_reason instead)
ALTER TABLE public.passport_timeline
  ALTER COLUMN significance DROP NOT NULL;

-- Add index for milestone_type
CREATE INDEX IF NOT EXISTS idx_passport_timeline_milestone_type 
  ON public.passport_timeline(user_id, milestone_type) WHERE milestone_type IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.passport_timeline.milestone_type IS 'Type of milestone: first_review, first_favorite_artist, first_favorite_venue, best_setlist, special_show, or custom';
COMMENT ON COLUMN public.passport_timeline.custom_reason IS 'User-provided reason why this moment is significant (for special_show and custom types)';


-- UPDATE PASSPORT_TIMELINE FOR USER MILESTONES
-- Add milestone_type and custom_reason columns
-- ============================================

-- Add new columns to passport_timeline
ALTER TABLE public.passport_timeline
  ADD COLUMN IF NOT EXISTS milestone_type TEXT CHECK (milestone_type IN (
    'first_review',
    'first_favorite_artist',
    'first_favorite_venue',
    'best_setlist',
    'special_show',
    'custom'
  )),
  ADD COLUMN IF NOT EXISTS custom_reason TEXT;

-- Update significance column to be nullable (users will use custom_reason instead)
ALTER TABLE public.passport_timeline
  ALTER COLUMN significance DROP NOT NULL;

-- Add index for milestone_type
CREATE INDEX IF NOT EXISTS idx_passport_timeline_milestone_type 
  ON public.passport_timeline(user_id, milestone_type) WHERE milestone_type IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.passport_timeline.milestone_type IS 'Type of milestone: first_review, first_favorite_artist, first_favorite_venue, best_setlist, special_show, or custom';
COMMENT ON COLUMN public.passport_timeline.custom_reason IS 'User-provided reason why this moment is significant (for special_show and custom types)';

