-- Create venue_profile table to match the expected schema in unifiedVenueSearchService
-- This table is referenced by the venue reviews system and needs to exist

CREATE TABLE IF NOT EXISTS public.venue_profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_venue_id TEXT,
  name TEXT NOT NULL,
  identifier TEXT,
  address JSONB,
  geo JSONB,
  maximum_attendee_capacity INTEGER,
  num_upcoming_events INTEGER DEFAULT 0,
  image_url TEXT,
  url TEXT,
  same_as TEXT[],
  date_published TIMESTAMP WITH TIME ZONE,
  date_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_profile ENABLE ROW LEVEL SECURITY;

-- Create policies for venue_profile table (public read)
CREATE POLICY "Venue profiles are viewable by everyone" 
ON public.venue_profile 
FOR SELECT 
USING (true);

CREATE POLICY "Venue profiles can be inserted by authenticated users" 
ON public.venue_profile 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Venue profiles can be updated by authenticated users" 
ON public.venue_profile 
FOR UPDATE 
WITH CHECK (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_venue_profile_jambase_id ON public.venue_profile(jambase_venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_profile_name ON public.venue_profile(name);
CREATE INDEX IF NOT EXISTS idx_venue_profile_identifier ON public.venue_profile(identifier);
CREATE INDEX IF NOT EXISTS idx_venue_profile_last_synced ON public.venue_profile(last_synced_at);

-- Create update trigger for timestamps
CREATE TRIGGER update_venue_profile_updated_at
  BEFORE UPDATE ON public.venue_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.venue_profile IS 'Enhanced venue profiles with JamBase integration and review support';
COMMENT ON COLUMN public.venue_profile.jambase_venue_id IS 'JamBase venue identifier';
COMMENT ON COLUMN public.venue_profile.identifier IS 'Venue identifier (may include jambase: prefix)';
COMMENT ON COLUMN public.venue_profile.address IS 'Venue address as JSONB object with streetAddress, addressLocality, etc.';
COMMENT ON COLUMN public.venue_profile.geo IS 'Geographic coordinates as JSONB with latitude and longitude';
COMMENT ON COLUMN public.venue_profile.maximum_attendee_capacity IS 'Maximum number of attendees the venue can hold';
COMMENT ON COLUMN public.venue_profile.num_upcoming_events IS 'Number of upcoming events at this venue';
COMMENT ON COLUMN public.venue_profile.last_synced_at IS 'Last time this venue data was synced from external API';
