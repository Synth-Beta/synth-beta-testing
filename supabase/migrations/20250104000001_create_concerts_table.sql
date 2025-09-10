-- Create concerts table for Jambase API data
CREATE TABLE public.concerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist TEXT NOT NULL,
  venue TEXT NOT NULL,
  date DATE NOT NULL,
  profile_pic TEXT,
  tour TEXT,
  setlist TEXT[],
  venue_location TEXT,
  source TEXT NOT NULL DEFAULT 'jambase_api',
  confidence TEXT NOT NULL DEFAULT 'high',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.concerts ENABLE ROW LEVEL SECURITY;

-- Allow public read access to concerts
CREATE POLICY "Concerts are viewable by everyone" 
ON public.concerts 
FOR SELECT 
USING (true);

-- Insert sample concert data
INSERT INTO public.concerts (artist, venue, date, profile_pic, tour, setlist, venue_location, source, confidence) VALUES
('Taylor Swift', 'Madison Square Garden', '2024-06-15', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', 'The Eras Tour', ARRAY['Anti-Hero', 'Love Story', 'Shake It Off', 'All Too Well'], 'New York, NY', 'jambase_api', 'high'),
('The Weeknd', 'SoFi Stadium', '2024-07-22', 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', 'After Hours Til Dawn Tour', ARRAY['Blinding Lights', 'Starboy', 'The Hills', 'Save Your Tears'], 'Inglewood, CA', 'jambase_api', 'high'),
('Billie Eilish', 'Hollywood Bowl', '2024-08-10', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', 'Happier Than Ever Tour', ARRAY['Bad Guy', 'Therefore I Am', 'Happier Than Ever', 'Ocean Eyes'], 'Los Angeles, CA', 'jambase_api', 'high'),
('Drake', 'Rogers Centre', '2024-09-05', 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', 'It''s All A Blur Tour', ARRAY['God''s Plan', 'Hotline Bling', 'One Dance', 'Started From The Bottom'], 'Toronto, ON', 'jambase_api', 'high'),
('Ariana Grande', 'MetLife Stadium', '2024-10-12', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', 'Sweetener World Tour', ARRAY['Thank U, Next', '7 Rings', 'Positions', 'Side To Side'], 'East Rutherford, NJ', 'jambase_api', 'high'),
('Ed Sheeran', 'Wembley Stadium', '2024-11-18', 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', 'Mathematics Tour', ARRAY['Shape of You', 'Perfect', 'Thinking Out Loud', 'Castle on the Hill'], 'London, UK', 'jambase_api', 'high'),
('Beyoncé', 'Mercedes-Benz Stadium', '2024-12-03', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', 'Renaissance World Tour', ARRAY['Break My Soul', 'Cuff It', 'Formation', 'Single Ladies'], 'Atlanta, GA', 'jambase_api', 'high'),
('Harry Styles', 'Fenway Park', '2025-01-20', 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', 'Love On Tour', ARRAY['As It Was', 'Watermelon Sugar', 'Adore You', 'Sign of the Times'], 'Boston, MA', 'jambase_api', 'high'),
('Olivia Rodrigo', 'Red Rocks Amphitheatre', '2025-02-14', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', 'GUTS World Tour', ARRAY['Vampire', 'Good 4 U', 'Drivers License', 'Deja Vu'], 'Morrison, CO', 'jambase_api', 'high'),
('Bad Bunny', 'Hard Rock Stadium', '2025-03-08', 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', 'Most Wanted Tour', ARRAY['Titi Me Pregunto', 'Moscow Mule', 'Efecto', 'Me Porto Bonito'], 'Miami, FL', 'jambase_api', 'high');

-- Add more sample data to reach ~100 concerts
INSERT INTO public.concerts (artist, venue, date, venue_location, source, confidence) VALUES
('Post Malone', 'T-Mobile Arena', '2024-06-20', 'Las Vegas, NV', 'jambase_api', 'high'),
('Dua Lipa', 'O2 Arena', '2024-07-01', 'London, UK', 'jambase_api', 'high'),
('The 1975', 'Hollywood Palladium', '2024-07-15', 'Los Angeles, CA', 'jambase_api', 'high'),
('Lana Del Rey', 'Radio City Music Hall', '2024-08-05', 'New York, NY', 'jambase_api', 'high'),
('SZA', 'Bridgestone Arena', '2024-08-25', 'Nashville, TN', 'jambase_api', 'high'),
('Travis Scott', 'Toyota Center', '2024-09-10', 'Houston, TX', 'jambase_api', 'high'),
('Doja Cat', 'Chase Center', '2024-09-28', 'San Francisco, CA', 'jambase_api', 'high'),
('Lil Nas X', 'State Farm Arena', '2024-10-15', 'Atlanta, GA', 'jambase_api', 'high'),
('Miley Cyrus', 'United Center', '2024-10-30', 'Chicago, IL', 'jambase_api', 'high'),
('Kendrick Lamar', 'Crypto.com Arena', '2024-11-12', 'Los Angeles, CA', 'jambase_api', 'high'),
('Lorde', 'Brooklyn Steel', '2024-11-25', 'Brooklyn, NY', 'jambase_api', 'high'),
('Tyler, The Creator', 'Fiddler''s Green Amphitheatre', '2024-12-08', 'Denver, CO', 'jambase_api', 'high'),
('Halsey', 'The Anthem', '2024-12-20', 'Washington, DC', 'jambase_api', 'high'),
('Frank Ocean', 'Coachella Valley Music Festival', '2025-01-05', 'Indio, CA', 'jambase_api', 'high'),
('Rihanna', 'Allegiant Stadium', '2025-01-25', 'Las Vegas, NV', 'jambase_api', 'high'),
('Bruno Mars', 'Fenway Park', '2025-02-10', 'Boston, MA', 'jambase_api', 'high'),
('Adele', 'Wembley Stadium', '2025-02-28', 'London, UK', 'jambase_api', 'high'),
('The Weeknd', 'Mercedes-Benz Stadium', '2025-03-15', 'Atlanta, GA', 'jambase_api', 'high'),
('Taylor Swift', 'SoFi Stadium', '2025-03-30', 'Inglewood, CA', 'jambase_api', 'high'),
('Billie Eilish', 'Madison Square Garden', '2025-04-12', 'New York, NY', 'jambase_api', 'high');
