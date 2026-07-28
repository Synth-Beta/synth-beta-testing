-- Seed the jambase_events table with sample artist data
-- This will make the artist search work immediately

INSERT INTO public.jambase_events (
  jambase_event_id,
  title,
  artist_name,
  artist_id,
  venue_name,
  venue_id,
  event_date,
  description,
  genres,
  venue_city,
  venue_state,
  ticket_available,
  price_range
) VALUES 
-- The Beatles
('beatles-1', 'The Beatles Live', 'The Beatles', 'beatles-001', 'Madison Square Garden', 'msg-001', '2024-06-15 20:00:00+00', 'Legendary rock band performance', ARRAY['Rock', 'Pop'], 'New York', 'NY', true, '$50-$200'),
('beatles-2', 'The Beatles Concert', 'The Beatles', 'beatles-001', 'Hollywood Bowl', 'hb-001', '2024-07-20 19:30:00+00', 'Outdoor concert under the stars', ARRAY['Rock', 'Pop'], 'Los Angeles', 'CA', true, '$75-$250'),

-- Radiohead
('radiohead-1', 'Radiohead Live', 'Radiohead', 'radiohead-001', 'Red Rocks Amphitheatre', 'rr-001', '2024-08-10 20:00:00+00', 'Alternative rock performance', ARRAY['Alternative Rock', 'Electronic'], 'Morrison', 'CO', true, '$60-$180'),
('radiohead-2', 'Radiohead Concert', 'Radiohead', 'radiohead-001', 'Berkeley Greek Theatre', 'bgt-001', '2024-09-05 19:00:00+00', 'Intimate outdoor venue', ARRAY['Alternative Rock', 'Electronic'], 'Berkeley', 'CA', true, '$55-$150'),

-- Pink Floyd
('pinkfloyd-1', 'Pink Floyd Tribute', 'Pink Floyd', 'pinkfloyd-001', 'Royal Albert Hall', 'rah-001', '2024-10-12 20:30:00+00', 'Progressive rock masterpiece', ARRAY['Progressive Rock', 'Psychedelic Rock'], 'London', 'UK', true, '$80-$300'),
('pinkfloyd-2', 'Pink Floyd Experience', 'Pink Floyd', 'pinkfloyd-001', 'Sydney Opera House', 'soh-001', '2024-11-18 20:00:00+00', 'Aussie tour performance', ARRAY['Progressive Rock', 'Psychedelic Rock'], 'Sydney', 'AU', true, '$90-$350'),

-- Goose
('goose-1', 'Goose Jam Session', 'Goose', 'goose-001', 'Brooklyn Bowl', 'bb-001', '2024-12-01 21:00:00+00', 'Jam band improvisation', ARRAY['Jam Band', 'Rock', 'Funk'], 'Brooklyn', 'NY', true, '$25-$75'),
('goose-2', 'Goose Live', 'Goose', 'goose-001', 'The Fillmore', 'fm-001', '2024-12-15 20:30:00+00', 'Intimate jam band experience', ARRAY['Jam Band', 'Rock', 'Funk'], 'San Francisco', 'CA', true, '$30-$80'),

-- Taylor Swift
('taylorswift-1', 'Taylor Swift Eras Tour', 'Taylor Swift', 'taylorswift-001', 'MetLife Stadium', 'mls-001', '2024-05-25 19:00:00+00', 'Eras Tour spectacular', ARRAY['Pop', 'Country'], 'East Rutherford', 'NJ', true, '$100-$500'),
('taylorswift-2', 'Taylor Swift Concert', 'Taylor Swift', 'taylorswift-001', 'SoFi Stadium', 'sofi-001', '2024-06-08 19:30:00+00', 'West Coast tour stop', ARRAY['Pop', 'Country'], 'Inglewood', 'CA', true, '$120-$600'),

-- Drake
('drake-1', 'Drake Live', 'Drake', 'drake-001', 'Barclays Center', 'bc-001', '2024-07-12 20:00:00+00', 'Hip-hop superstar performance', ARRAY['Hip-Hop', 'R&B'], 'Brooklyn', 'NY', true, '$80-$400'),
('drake-2', 'Drake Concert', 'Drake', 'drake-001', 'United Center', 'uc-001', '2024-08-03 20:30:00+00', 'Chicago tour date', ARRAY['Hip-Hop', 'R&B'], 'Chicago', 'IL', true, '$90-$450'),

-- Billie Eilish
('billie-1', 'Billie Eilish Live', 'Billie Eilish', 'billie-001', 'TD Garden', 'tdg-001', '2024-09-20 20:00:00+00', 'Alternative pop sensation', ARRAY['Alternative Pop', 'Electronic'], 'Boston', 'MA', true, '$70-$300'),
('billie-2', 'Billie Eilish Concert', 'Billie Eilish', 'billie-001', 'Climate Pledge Arena', 'cpa-001', '2024-10-10 19:30:00+00', 'Seattle tour stop', ARRAY['Alternative Pop', 'Electronic'], 'Seattle', 'WA', true, '$75-$350'),

-- The Weeknd
('weeknd-1', 'The Weeknd Live', 'The Weeknd', 'weeknd-001', 'Mercedes-Benz Stadium', 'mbs-001', '2024-11-05 20:00:00+00', 'R&B superstar performance', ARRAY['R&B', 'Pop'], 'Atlanta', 'GA', true, '$85-$400'),
('weeknd-2', 'The Weeknd Concert', 'The Weeknd', 'weeknd-001', 'Rogers Place', 'rp-001', '2024-12-12 20:30:00+00', 'Canadian tour date', ARRAY['R&B', 'Pop'], 'Edmonton', 'AB', true, '$90-$450'),

-- Harry Styles
('harry-1', 'Harry Styles Live', 'Harry Styles', 'harry-001', 'Wembley Stadium', 'ws-001', '2024-08-25 19:00:00+00', 'Pop sensation live', ARRAY['Pop', 'Rock'], 'London', 'UK', true, '$60-$250'),
('harry-2', 'Harry Styles Concert', 'Harry Styles', 'harry-001', 'Fenway Park', 'fp-001', '2024-09-15 19:30:00+00', 'Historic ballpark performance', ARRAY['Pop', 'Rock'], 'Boston', 'MA', true, '$65-$275'),

-- Bad Bunny
('badbunny-1', 'Bad Bunny Live', 'Bad Bunny', 'badbunny-001', 'American Airlines Arena', 'aaa-001', '2024-10-30 20:00:00+00', 'Reggaeton superstar', ARRAY['Reggaeton', 'Latin'], 'Miami', 'FL', true, '$50-$200'),
('badbunny-2', 'Bad Bunny Concert', 'Bad Bunny', 'badbunny-001', 'Staples Center', 'sc-001', '2024-11-22 20:30:00+00', 'West Coast performance', ARRAY['Reggaeton', 'Latin'], 'Los Angeles', 'CA', true, '$55-$225'),

-- Ed Sheeran
('edsheeran-1', 'Ed Sheeran Live', 'Ed Sheeran', 'edsheeran-001', 'Croke Park', 'cp-001', '2024-07-18 19:00:00+00', 'Acoustic pop performance', ARRAY['Pop', 'Folk'], 'Dublin', 'IE', true, '$45-$150'),
('edsheeran-2', 'Ed Sheeran Concert', 'Ed Sheeran', 'edsheeran-001', 'Gillette Stadium', 'gs-001', '2024-08-30 19:30:00+00', 'Stadium tour stop', ARRAY['Pop', 'Folk'], 'Foxborough', 'MA', true, '$50-$175'),

-- Post Malone
('postmalone-1', 'Post Malone Live', 'Post Malone', 'postmalone-001', 'T-Mobile Arena', 'tma-001', '2024-09-08 20:00:00+00', 'Hip-hop and rock fusion', ARRAY['Hip-Hop', 'Rock'], 'Las Vegas', 'NV', true, '$60-$200'),
('postmalone-2', 'Post Malone Concert', 'Post Malone', 'postmalone-001', 'Bridgestone Arena', 'ba-001', '2024-10-25 20:30:00+00', 'Nashville tour date', ARRAY['Hip-Hop', 'Rock'], 'Nashville', 'TN', true, '$65-$225'),

-- Ariana Grande
('ariana-1', 'Ariana Grande Live', 'Ariana Grande', 'ariana-001', 'Madison Square Garden', 'msg-002', '2024-11-15 20:00:00+00', 'Pop diva performance', ARRAY['Pop', 'R&B'], 'New York', 'NY', true, '$75-$300'),
('ariana-2', 'Ariana Grande Concert', 'Ariana Grande', 'ariana-002', 'Chase Center', 'cc-001', '2024-12-20 19:30:00+00', 'San Francisco show', ARRAY['Pop', 'R&B'], 'San Francisco', 'CA', true, '$80-$325'),

-- Some past events for testing
('past-1', 'The Beatles 1969', 'The Beatles', 'beatles-001', 'Rooftop Concert', 'rt-001', '1969-01-30 12:00:00+00', 'Famous rooftop performance', ARRAY['Rock', 'Pop'], 'London', 'UK', false, 'Free'),
('past-2', 'Pink Floyd 1973', 'Pink Floyd', 'pinkfloyd-001', 'Earls Court', 'ec-001', '1973-05-18 20:00:00+00', 'Dark Side of the Moon tour', ARRAY['Progressive Rock'], 'London', 'UK', false, '$5-$15');

-- Create some additional artists with multiple events
INSERT INTO public.jambase_events (
  jambase_event_id,
  title,
  artist_name,
  artist_id,
  venue_name,
  venue_id,
  event_date,
  description,
  genres,
  venue_city,
  venue_state,
  ticket_available,
  price_range
) VALUES 
-- Multiple events for popular artists
('beatles-3', 'The Beatles Reunion', 'The Beatles', 'beatles-001', 'Abbey Road Studios', 'ars-001', '2024-12-25 20:00:00+00', 'Special Christmas performance', ARRAY['Rock', 'Pop'], 'London', 'UK', true, '$200-$500'),
('radiohead-3', 'Radiohead Acoustic', 'Radiohead', 'radiohead-001', 'Radio City Music Hall', 'rcmh-001', '2024-11-30 20:00:00+00', 'Intimate acoustic set', ARRAY['Alternative Rock', 'Acoustic'], 'New York', 'NY', true, '$100-$300'),
('goose-3', 'Goose Festival', 'Goose', 'goose-001', 'Bonnaroo', 'br-001', '2024-06-15 18:00:00+00', 'Festival performance', ARRAY['Jam Band', 'Rock'], 'Manchester', 'TN', true, '$50-$200');
