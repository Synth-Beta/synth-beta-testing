-- Seed script to populate the review system with sample data
-- This script should be run after creating the user_reviews table

-- First, let's check if we have any jambase_events to work with
-- If not, we'll create some sample events

-- Insert sample events if they don't exist
INSERT INTO jambase_events (
  id,
  jambase_event_id,
  title,
  artist_name,
  venue_name,
  event_date,
  venue_city,
  venue_state,
  description,
  genres,
  ticket_available,
  price_range
) VALUES 
  (
    gen_random_uuid(),
    'sample_event_1',
    'Taylor Swift - The Eras Tour',
    'Taylor Swift',
    'Madison Square Garden',
    '2024-06-15T20:00:00Z',
    'New York',
    'NY',
    'The Eras Tour is the ongoing sixth concert tour by American singer-songwriter Taylor Swift.',
    ARRAY['pop', 'country'],
    true,
    '$75 - $500'
  ),
  (
    gen_random_uuid(),
    'sample_event_2',
    'The Weeknd - After Hours Til Dawn Tour',
    'The Weeknd',
    'Hollywood Bowl',
    '2024-07-20T19:30:00Z',
    'Los Angeles',
    'CA',
    'Experience The Weeknd live in concert with his spectacular production.',
    ARRAY['r&b', 'pop'],
    true,
    '$100 - $300'
  ),
  (
    gen_random_uuid(),
    'sample_event_3',
    'Metallica - M72 World Tour',
    'Metallica',
    'Soldier Field',
    '2024-08-10T19:00:00Z',
    'Chicago',
    'IL',
    'Heavy metal legends Metallica bring their M72 World Tour to Chicago.',
    ARRAY['metal', 'rock'],
    true,
    '$80 - $200'
  ),
  (
    gen_random_uuid(),
    'sample_event_4',
    'Billie Eilish - Happier Than Ever Tour',
    'Billie Eilish',
    'Red Rocks Amphitheatre',
    '2024-09-05T20:00:00Z',
    'Morrison',
    'CO',
    'Billie Eilish performs at the iconic Red Rocks Amphitheatre.',
    ARRAY['pop', 'alternative'],
    true,
    '$90 - $250'
  ),
  (
    gen_random_uuid(),
    'sample_event_5',
    'Drake - It''s All A Blur Tour',
    'Drake',
    'Barclays Center',
    '2024-10-12T20:30:00Z',
    'Brooklyn',
    'NY',
    'Drake brings his It''s All A Blur Tour to Brooklyn.',
    ARRAY['hip-hop', 'rap'],
    true,
    '$120 - $400'
  )
ON CONFLICT (jambase_event_id) DO NOTHING;

-- Get the event IDs for creating reviews
-- Note: In a real scenario, you'd get these from your actual events
-- For this example, we'll use the events we just created

-- Create sample user reviews
-- First, we need to get some user IDs from auth.users
-- For this example, we'll assume there are some users in the system

-- Insert sample reviews (you'll need to replace the user_id values with actual user IDs)
INSERT INTO user_reviews (
  user_id,
  event_id,
  rating,
  review_text,
  is_public,
  likes_count,
  comments_count,
  shares_count
)
SELECT 
  u.id as user_id,
  je.id as event_id,
  CASE 
    WHEN je.artist_name = 'Taylor Swift' THEN 5
    WHEN je.artist_name = 'The Weeknd' THEN 4
    WHEN je.artist_name = 'Metallica' THEN 5
    WHEN je.artist_name = 'Billie Eilish' THEN 4
    WHEN je.artist_name = 'Drake' THEN 3
  END as rating,
  CASE 
    WHEN je.artist_name = 'Taylor Swift' THEN 'Absolutely incredible show! The production value was off the charts and Taylor''s performance was flawless. The crowd energy was electric all night long.'
    WHEN je.artist_name = 'The Weeknd' THEN 'Great performance with amazing visuals. The Weeknd''s voice was incredible live. The setlist was perfect and the venue was beautiful.'
    WHEN je.artist_name = 'Metallica' THEN 'Epic metal show! These guys still rock harder than bands half their age. The guitar solos were mind-blowing and the crowd was absolutely wild.'
    WHEN je.artist_name = 'Billie Eilish' THEN 'Intimate and powerful performance. Billie''s stage presence is incredible and the Red Rocks setting made it magical. Her voice was perfect.'
    WHEN je.artist_name = 'Drake' THEN 'Solid show with great energy. Drake knows how to work a crowd and the production was impressive. Some technical issues but overall good.'
  END as review_text,
  true as is_public,
  CASE 
    WHEN je.artist_name = 'Taylor Swift' THEN 15
    WHEN je.artist_name = 'The Weeknd' THEN 8
    WHEN je.artist_name = 'Metallica' THEN 12
    WHEN je.artist_name = 'Billie Eilish' THEN 6
    WHEN je.artist_name = 'Drake' THEN 4
  END as likes_count,
  CASE 
    WHEN je.artist_name = 'Taylor Swift' THEN 3
    WHEN je.artist_name = 'The Weeknd' THEN 1
    WHEN je.artist_name = 'Metallica' THEN 2
    WHEN je.artist_name = 'Billie Eilish' THEN 1
    WHEN je.artist_name = 'Drake' THEN 0
  END as comments_count,
  CASE 
    WHEN je.artist_name = 'Taylor Swift' THEN 5
    WHEN je.artist_name = 'The Weeknd' THEN 2
    WHEN je.artist_name = 'Metallica' THEN 3
    WHEN je.artist_name = 'Billie Eilish' THEN 1
    WHEN je.artist_name = 'Drake' THEN 1
  END as shares_count
FROM jambase_events je
CROSS JOIN (
  SELECT id FROM auth.users LIMIT 3
) u
WHERE je.jambase_event_id IN ('sample_event_1', 'sample_event_2', 'sample_event_3', 'sample_event_4', 'sample_event_5')
ON CONFLICT (user_id, event_id) DO NOTHING;

-- Create some sample review likes
INSERT INTO review_likes (user_id, review_id)
SELECT 
  u.id as user_id,
  ur.id as review_id
FROM user_reviews ur
CROSS JOIN (
  SELECT id FROM auth.users LIMIT 2
) u
WHERE ur.is_public = true
LIMIT 10
ON CONFLICT (user_id, review_id) DO NOTHING;

-- Create some sample review comments
INSERT INTO review_comments (user_id, review_id, comment_text)
SELECT 
  u.id as user_id,
  ur.id as review_id,
  CASE 
    WHEN ur.rating = 5 THEN 'I totally agree! This was an amazing show!'
    WHEN ur.rating = 4 THEN 'Great review! I had a similar experience.'
    WHEN ur.rating = 3 THEN 'Thanks for sharing your thoughts!'
    ELSE 'Interesting perspective!'
  END as comment_text
FROM user_reviews ur
CROSS JOIN (
  SELECT id FROM auth.users LIMIT 2
) u
WHERE ur.is_public = true
LIMIT 8
ON CONFLICT DO NOTHING;

-- Create some sample review shares
INSERT INTO review_shares (user_id, review_id, share_platform)
SELECT 
  u.id as user_id,
  ur.id as review_id,
  CASE 
    WHEN ur.rating = 5 THEN 'facebook'
    WHEN ur.rating = 4 THEN 'twitter'
    ELSE 'copy_link'
  END as share_platform
FROM user_reviews ur
CROSS JOIN (
  SELECT id FROM auth.users LIMIT 2
) u
WHERE ur.is_public = true
LIMIT 6
ON CONFLICT DO NOTHING;

-- Update the review counts to match the actual likes/comments/shares
UPDATE user_reviews 
SET 
  likes_count = (
    SELECT COUNT(*) FROM review_likes 
    WHERE review_likes.review_id = user_reviews.id
  ),
  comments_count = (
    SELECT COUNT(*) FROM review_comments 
    WHERE review_comments.review_id = user_reviews.id
  ),
  shares_count = (
    SELECT COUNT(*) FROM review_shares 
    WHERE review_shares.review_id = user_reviews.id
  );
