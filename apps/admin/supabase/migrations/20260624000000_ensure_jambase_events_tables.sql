-- Ensure the event tables expected by the app exist in production.
CREATE TABLE IF NOT EXISTS public.jambase_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_event_id TEXT UNIQUE,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artist_id TEXT,
  venue_name TEXT NOT NULL,
  venue_id TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  doors_time TIMESTAMPTZ,
  description TEXT,
  genres TEXT[],
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_zip TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  ticket_available BOOLEAN DEFAULT false,
  price_range TEXT,
  ticket_urls TEXT[],
  setlist JSONB,
  tour_name TEXT,
  is_user_created BOOLEAN DEFAULT false,
  setlist_fm_id TEXT,
  setlist_fm_url TEXT,
  setlist_source TEXT,
  setlist_enriched BOOLEAN DEFAULT false,
  setlist_song_count INTEGER,
  setlist_last_updated TIMESTAMPTZ,
  artist_uuid UUID,
  venue_uuid UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_jambase_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  jambase_event_id UUID REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  interested BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, jambase_event_id)
);

CREATE INDEX IF NOT EXISTS idx_jambase_events_jambase_event_id ON public.jambase_events(jambase_event_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_name ON public.jambase_events(artist_name);
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_name ON public.jambase_events(venue_name);
CREATE INDEX IF NOT EXISTS idx_jambase_events_event_date ON public.jambase_events(event_date);
CREATE INDEX IF NOT EXISTS idx_jambase_events_created_at ON public.jambase_events(created_at);
CREATE INDEX IF NOT EXISTS idx_jambase_events_user_created ON public.jambase_events(is_user_created);
CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_uuid ON public.jambase_events(artist_uuid);
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_uuid ON public.jambase_events(venue_uuid);
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_user_id ON public.user_jambase_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_jambase_event_id ON public.user_jambase_events(jambase_event_id);
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_created_at ON public.user_jambase_events(created_at);

ALTER TABLE public.jambase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_jambase_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jambase_events'
      AND policyname = 'JamBase events are viewable by everyone'
  ) THEN
    CREATE POLICY "JamBase events are viewable by everyone"
    ON public.jambase_events
    FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jambase_events'
      AND policyname = 'JamBase events can be created by authenticated users'
  ) THEN
    CREATE POLICY "JamBase events can be created by authenticated users"
    ON public.jambase_events
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_jambase_events'
      AND policyname = 'Users can view their own JamBase event associations'
  ) THEN
    CREATE POLICY "Users can view their own JamBase event associations"
    ON public.user_jambase_events
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_jambase_events'
      AND policyname = 'Users can create their own JamBase event associations'
  ) THEN
    CREATE POLICY "Users can create their own JamBase event associations"
    ON public.user_jambase_events
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
