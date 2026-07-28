-- Create jambase_events table (separate from your existing events table)
CREATE TABLE IF NOT EXISTS jambase_events (
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_jambase_events junction table
CREATE TABLE IF NOT EXISTS user_jambase_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  jambase_event_id UUID REFERENCES jambase_events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, jambase_event_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_jambase_events_jambase_event_id ON jambase_events(jambase_event_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_name ON jambase_events(artist_name);
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_name ON jambase_events(venue_name);
CREATE INDEX IF NOT EXISTS idx_jambase_events_event_date ON jambase_events(event_date);
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_user_id ON user_jambase_events(user_id);

-- Enable RLS
ALTER TABLE jambase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_jambase_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "JamBase events are viewable by everyone" ON jambase_events FOR SELECT USING (true);
CREATE POLICY "JamBase events can be created by authenticated users" ON jambase_events FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can view their own JamBase event associations" ON user_jambase_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own JamBase event associations" ON user_jambase_events FOR INSERT WITH CHECK (auth.uid() = user_id);
