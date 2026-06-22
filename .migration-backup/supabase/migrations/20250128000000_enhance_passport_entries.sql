-- ============================================
-- ENHANCE PASSPORT_ENTRIES TABLE
-- Add new stamp types, rarity, and cultural_context
-- ============================================

-- Add new columns to passport_entries
ALTER TABLE public.passport_entries
  ADD COLUMN IF NOT EXISTS rarity TEXT CHECK (rarity IN ('common', 'uncommon', 'legendary')) DEFAULT 'common',
  ADD COLUMN IF NOT EXISTS cultural_context TEXT;

-- Update type CHECK constraint to include new types
ALTER TABLE public.passport_entries
  DROP CONSTRAINT IF EXISTS passport_entries_type_check;

ALTER TABLE public.passport_entries
  ADD CONSTRAINT passport_entries_type_check CHECK (
    type IN ('city', 'venue', 'artist', 'scene', 'era', 'festival', 'artist_milestone')
  );

-- Create indexes for rarity
CREATE INDEX IF NOT EXISTS idx_passport_entries_rarity 
  ON public.passport_entries(user_id, rarity);

CREATE INDEX IF NOT EXISTS idx_passport_entries_type_rarity 
  ON public.passport_entries(type, rarity);

-- Update existing entries to have default rarity
UPDATE public.passport_entries
SET rarity = 'common'
WHERE rarity IS NULL;

-- Add comment explaining rarity levels
COMMENT ON COLUMN public.passport_entries.rarity IS 'Stamp rarity: common (default), uncommon (special venues/scenes), legendary (iconic moments)';
COMMENT ON COLUMN public.passport_entries.cultural_context IS 'One-line explanation of why this stamp matters culturally';

