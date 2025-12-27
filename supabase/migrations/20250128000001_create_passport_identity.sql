-- ============================================
-- CREATE PASSPORT_IDENTITY TABLE
-- Store passport identity metadata (fan type, home scene, join year)
-- ============================================

CREATE TABLE IF NOT EXISTS public.passport_identity (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fan_type TEXT CHECK (fan_type IN (
    'jam_chaser',
    'venue_purist', 
    'scene_builder',
    'road_tripper',
    'genre_explorer',
    'festival_fanatic'
  )),
  home_scene_id UUID REFERENCES public.scenes(id) ON DELETE SET NULL,
  join_year INTEGER NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_passport_identity_fan_type 
  ON public.passport_identity(fan_type);

CREATE INDEX IF NOT EXISTS idx_passport_identity_home_scene 
  ON public.passport_identity(home_scene_id);

-- Enable RLS
ALTER TABLE public.passport_identity ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own passport identity" ON public.passport_identity;
DROP POLICY IF EXISTS "Users can insert their own passport identity" ON public.passport_identity;
DROP POLICY IF EXISTS "Users can update their own passport identity" ON public.passport_identity;

CREATE POLICY "Users can view their own passport identity"
  ON public.passport_identity
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own passport identity"
  ON public.passport_identity
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own passport identity"
  ON public.passport_identity
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.passport_identity TO authenticated;

-- Add comments
COMMENT ON TABLE public.passport_identity IS 'Passport identity metadata: fan type archetype, home scene, and join year';
COMMENT ON COLUMN public.passport_identity.fan_type IS 'Algorithmically inferred fan archetype';
COMMENT ON COLUMN public.passport_identity.home_scene_id IS 'Primary scene user identifies with (inferred, not selected)';
COMMENT ON COLUMN public.passport_identity.join_year IS 'Year user joined Synth (from users.created_at)';

