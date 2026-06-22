-- ============================================
-- CREATE PASSPORT_TASTE_MAP TABLE
-- Store calculated taste fingerprint (genre, venue, energy, era preferences)
-- ============================================

CREATE TABLE IF NOT EXISTS public.passport_taste_map (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  core_genres JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "indie_rock": 0.42, "jam_band": 0.35, ... }
  venue_affinity JSONB DEFAULT '{}'::jsonb, -- { "small_rooms": 0.6, "big_sheds": 0.3, "festivals": 0.1 }
  energy_preference JSONB DEFAULT '{}'::jsonb, -- { "intimate": 0.4, "moderate": 0.4, "chaotic": 0.2 }
  era_bias JSONB DEFAULT '{}'::jsonb, -- { "legacy": 0.3, "new_acts": 0.7 }
  calculated_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_passport_taste_map_core_genres 
  ON public.passport_taste_map USING GIN(core_genres);

CREATE INDEX IF NOT EXISTS idx_passport_taste_map_venue_affinity 
  ON public.passport_taste_map USING GIN(venue_affinity);

CREATE INDEX IF NOT EXISTS idx_passport_taste_map_updated_at 
  ON public.passport_taste_map(updated_at DESC);

-- Enable RLS
ALTER TABLE public.passport_taste_map ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own passport taste map" ON public.passport_taste_map;
DROP POLICY IF EXISTS "Users can insert their own passport taste map" ON public.passport_taste_map;
DROP POLICY IF EXISTS "Users can update their own passport taste map" ON public.passport_taste_map;

CREATE POLICY "Users can view their own passport taste map"
  ON public.passport_taste_map
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own passport taste map"
  ON public.passport_taste_map
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own passport taste map"
  ON public.passport_taste_map
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.passport_taste_map TO authenticated;

-- Add comments
COMMENT ON TABLE public.passport_taste_map IS 'Passive, evolving taste fingerprint calculated from user behavior';
COMMENT ON COLUMN public.passport_taste_map.core_genres IS 'Weighted genre preferences (normalized 0-1)';
COMMENT ON COLUMN public.passport_taste_map.venue_affinity IS 'Preference for venue types (small_rooms, big_sheds, festivals, etc.)';
COMMENT ON COLUMN public.passport_taste_map.energy_preference IS 'Preferred energy levels (intimate, moderate, chaotic)';
COMMENT ON COLUMN public.passport_taste_map.era_bias IS 'Preference for legacy vs new acts (based on artist formation dates)';

