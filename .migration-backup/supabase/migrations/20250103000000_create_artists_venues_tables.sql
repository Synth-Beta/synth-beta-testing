-- Create artists table to store JamBase artist data
CREATE TABLE IF NOT EXISTS public.artists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_artist_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL,
  url TEXT,
  image_url TEXT,
  date_published TIMESTAMP WITH TIME ZONE,
  date_modified TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create venues table to store JamBase venue data
CREATE TABLE IF NOT EXISTS public.venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_venue_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL,
  url TEXT,
  image_url TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  date_published TIMESTAMP WITH TIME ZONE,
  date_modified TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_artists table to track user's selected artists
CREATE TABLE IF NOT EXISTS public.user_artists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, artist_id)
);

-- Create user_venues table to track user's selected venues
CREATE TABLE IF NOT EXISTS public.user_venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id)
);

-- Create user_events table to store user-created events with artist/venue references
CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- Create policies for artists table (public read)
CREATE POLICY "Artists are viewable by everyone" 
ON public.artists 
FOR SELECT 
USING (true);

CREATE POLICY "Artists can be inserted by authenticated users" 
ON public.artists 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Create policies for venues table (public read)
CREATE POLICY "Venues are viewable by everyone" 
ON public.venues 
FOR SELECT 
USING (true);

CREATE POLICY "Venues can be inserted by authenticated users" 
ON public.venues 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Create policies for user_artists table
CREATE POLICY "Users can view their own artists" 
ON public.user_artists 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own artists" 
ON public.user_artists 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own artists" 
ON public.user_artists 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create policies for user_venues table
CREATE POLICY "Users can view their own venues" 
ON public.user_venues 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own venues" 
ON public.user_venues 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own venues" 
ON public.user_venues 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create policies for user_events table
CREATE POLICY "Users can view their own events" 
ON public.user_events 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own events" 
ON public.user_events 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own events" 
ON public.user_events 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own events" 
ON public.user_events 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_artists_jambase_id ON public.artists(jambase_artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_name ON public.artists(name);
CREATE INDEX IF NOT EXISTS idx_venues_jambase_id ON public.venues(jambase_venue_id);
CREATE INDEX IF NOT EXISTS idx_venues_name ON public.venues(name);
CREATE INDEX IF NOT EXISTS idx_venues_city_state ON public.venues(city, state);
CREATE INDEX IF NOT EXISTS idx_user_artists_user_id ON public.user_artists(user_id);
CREATE INDEX IF NOT EXISTS idx_user_venues_user_id ON public.user_venues(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON public.user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_date ON public.user_events(event_date);

-- Create update triggers for timestamps
CREATE TRIGGER update_artists_updated_at
  BEFORE UPDATE ON public.artists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venues_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_events_updated_at
  BEFORE UPDATE ON public.user_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
