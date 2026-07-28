-- Create jambase_cities table for storing city data from JamBase API
CREATE TABLE IF NOT EXISTS jambase_cities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_city_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  upcoming_events_count INTEGER DEFAULT 0,
  metro_id TEXT,
  metro_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_jambase_cities_jambase_city_id ON jambase_cities(jambase_city_id);
CREATE INDEX IF NOT EXISTS idx_jambase_cities_name ON jambase_cities(name);
CREATE INDEX IF NOT EXISTS idx_jambase_cities_country ON jambase_cities(country);
CREATE INDEX IF NOT EXISTS idx_jambase_cities_state ON jambase_cities(state);
CREATE INDEX IF NOT EXISTS idx_jambase_cities_coordinates ON jambase_cities(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_jambase_cities_upcoming_events ON jambase_cities(upcoming_events_count DESC);

-- Add RLS policies
ALTER TABLE jambase_cities ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to jambase_cities" ON jambase_cities
  FOR SELECT USING (true);

-- Allow authenticated users to insert/update
CREATE POLICY "Allow authenticated users to insert jambase_cities" ON jambase_cities
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update jambase_cities" ON jambase_cities
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Add comments
COMMENT ON TABLE jambase_cities IS 'Cities data from JamBase API with upcoming events counts';
COMMENT ON COLUMN jambase_cities.jambase_city_id IS 'Unique identifier from JamBase API';
COMMENT ON COLUMN jambase_cities.name IS 'City name';
COMMENT ON COLUMN jambase_cities.state IS 'State or province name';
COMMENT ON COLUMN jambase_cities.country IS 'Country name';
COMMENT ON COLUMN jambase_cities.latitude IS 'City latitude coordinate';
COMMENT ON COLUMN jambase_cities.longitude IS 'City longitude coordinate';
COMMENT ON COLUMN jambase_cities.upcoming_events_count IS 'Number of upcoming events in this city';
COMMENT ON COLUMN jambase_cities.metro_id IS 'Metropolitan area identifier from JamBase';
COMMENT ON COLUMN jambase_cities.metro_name IS 'Metropolitan area name from JamBase';
