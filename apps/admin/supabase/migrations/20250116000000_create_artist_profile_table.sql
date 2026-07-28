-- Create artist_profile table to store JamBase Artist API data
CREATE TABLE IF NOT EXISTS public.artist_profile (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Basic artist information from JamBase API
  jambase_artist_id TEXT UNIQUE NOT NULL,
  artist_data_source TEXT NOT NULL DEFAULT 'jambase',
  name TEXT NOT NULL,
  identifier TEXT UNIQUE NOT NULL, -- e.g., "jambase:194164"
  url TEXT,
  image_url TEXT,
  date_published TIMESTAMPTZ,
  date_modified TIMESTAMPTZ,
  
  -- Artist type and classification
  artist_type TEXT, -- "MusicGroup" or "Person"
  band_or_musician TEXT, -- "band" or "musician"
  
  -- Location and founding information
  founding_location TEXT,
  founding_date TEXT,
  
  -- Genres (stored as array)
  genres TEXT[],
  
  -- Member relationships
  members JSONB, -- Array of member objects
  member_of JSONB, -- Array of groups this artist is a member of
  
  -- External identifiers from various platforms
  external_identifiers JSONB, -- Array of external ID objects
  
  -- Social media and external links
  same_as JSONB, -- Array of social media and official site links
  
  -- Event statistics
  num_upcoming_events INTEGER DEFAULT 0,
  
  -- JamBase specific data
  raw_jambase_data JSONB, -- Store the complete API response for reference
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_artist_data_source CHECK (artist_data_source IN (
    'axs', 'dice', 'etix', 'eventbrite', 'eventim-de', 'jambase', 
    'seated', 'seatgeek', 'spotify', 'ticketmaster', 'viagogo', 'musicbrainz'
  )),
  CONSTRAINT valid_artist_type CHECK (artist_type IN ('MusicGroup', 'Person')),
  CONSTRAINT valid_band_or_musician CHECK (band_or_musician IN ('band', 'musician'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_artist_profile_jambase_artist_id ON public.artist_profile(jambase_artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_profile_identifier ON public.artist_profile(identifier);
CREATE INDEX IF NOT EXISTS idx_artist_profile_name ON public.artist_profile(name);
CREATE INDEX IF NOT EXISTS idx_artist_profile_artist_type ON public.artist_profile(artist_type);
CREATE INDEX IF NOT EXISTS idx_artist_profile_band_or_musician ON public.artist_profile(band_or_musician);
CREATE INDEX IF NOT EXISTS idx_artist_profile_genres ON public.artist_profile USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_artist_profile_external_identifiers ON public.artist_profile USING GIN(external_identifiers);
CREATE INDEX IF NOT EXISTS idx_artist_profile_same_as ON public.artist_profile USING GIN(same_as);
CREATE INDEX IF NOT EXISTS idx_artist_profile_created_at ON public.artist_profile(created_at);
CREATE INDEX IF NOT EXISTS idx_artist_profile_updated_at ON public.artist_profile(updated_at);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_artist_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_artist_profile_updated_at
  BEFORE UPDATE ON public.artist_profile
  FOR EACH ROW
  EXECUTE FUNCTION update_artist_profile_updated_at();

-- Enable Row Level Security
ALTER TABLE public.artist_profile ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow everyone to read artist profiles (public data)
CREATE POLICY "Artist profiles are viewable by everyone" 
ON public.artist_profile 
FOR SELECT 
USING (true);

-- Allow authenticated users to insert artist profiles
CREATE POLICY "Authenticated users can create artist profiles" 
ON public.artist_profile 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update artist profiles
CREATE POLICY "Authenticated users can update artist profiles" 
ON public.artist_profile 
FOR UPDATE 
USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete artist profiles (for cleanup)
CREATE POLICY "Authenticated users can delete artist profiles" 
ON public.artist_profile 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- Create a view for easier querying of artist data
CREATE OR REPLACE VIEW public.artist_profile_summary AS
SELECT 
  id,
  jambase_artist_id,
  name,
  identifier,
  url,
  image_url,
  artist_type,
  band_or_musician,
  founding_location,
  founding_date,
  genres,
  num_upcoming_events,
  created_at,
  updated_at,
  last_synced_at
FROM public.artist_profile;

-- Grant permissions on the view
GRANT SELECT ON public.artist_profile_summary TO authenticated;
GRANT SELECT ON public.artist_profile_summary TO anon;

-- Add comments for documentation
COMMENT ON TABLE public.artist_profile IS 'Stores artist profile data from JamBase API and other music data sources';
COMMENT ON COLUMN public.artist_profile.jambase_artist_id IS 'The unique JamBase artist ID';
COMMENT ON COLUMN public.artist_profile.artist_data_source IS 'The data source for the artist ID (jambase, spotify, etc.)';
COMMENT ON COLUMN public.artist_profile.identifier IS 'Full identifier including source (e.g., "jambase:194164")';
COMMENT ON COLUMN public.artist_profile.members IS 'JSON array of band members or group members';
COMMENT ON COLUMN public.artist_profile.member_of IS 'JSON array of groups this artist is a member of';
COMMENT ON COLUMN public.artist_profile.external_identifiers IS 'JSON array of external platform identifiers';
COMMENT ON COLUMN public.artist_profile.same_as IS 'JSON array of social media and official site links';
COMMENT ON COLUMN public.artist_profile.raw_jambase_data IS 'Complete JamBase API response for reference and debugging';
