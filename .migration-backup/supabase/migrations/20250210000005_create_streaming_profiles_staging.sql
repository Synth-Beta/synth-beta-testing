-- ============================================================
-- STAGING TABLE: streaming_profiles
-- ============================================================
-- NOT 3NF: profile_data stores raw Spotify/Apple Music API payloads (JSONB).
-- This is intentional - staging table for external API responses.
--
-- Normalized extraction happens via triggers:
--   - capture_streaming_music_data (20250210000006) -> user_genre_interactions, etc.
--   - process_spotify_genres_to_signals (20260202000001) -> user_preference_signals (3NF)
--
-- The canonical 3NF data lives in: user_preference_signals, genres, artists, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.streaming_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_type TEXT NOT NULL,
  profile_data JSONB DEFAULT '{}'::jsonb,
  sync_status TEXT,
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT streaming_profiles_user_service_unique UNIQUE (user_id, service_type)
);

-- FK to auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'streaming_profiles'
      AND constraint_name = 'streaming_profiles_user_id_fkey'
  ) THEN
    ALTER TABLE public.streaming_profiles
      ADD CONSTRAINT streaming_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- RLS: users can manage their own streaming profiles
ALTER TABLE public.streaming_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own streaming profiles" ON public.streaming_profiles;
CREATE POLICY "Users can manage own streaming profiles" ON public.streaming_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
