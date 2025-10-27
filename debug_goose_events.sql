-- Query geSQL to find all Goose events in the database
SELECT 
  id,
  jambase_event_id,
  title,
  artist_name,
  venue_name,
  event_date,
  ticket_available,
  created_at,
  updated_at
FROM jambase_events
WHERE artist_name ILIKE '%Goose%'
ORDER BY event_date ASC;

-- Query to find specifically upcoming Goose events (after current date)
SELECT 
  id,
  jambase_event_id,
  title,
  artist_name,
  venue_name,
  event_date,
  ticket_available,
  CASE 
    WHEN event_date > NOW() THEN 'Upcoming'
    WHEN event_date < NOW() THEN 'Past'
    ELSE 'Today'
  END as status
FROM jambase_events
WHERE artist_name ILIKE '%Goose%'
  AND event_date > NOW()
ORDER BY event_date ASC;

-- Query to check if there are any Goose events with titles like "Goose at Amica Mutual Pavilion"
SELECT 
  id,
  title,
  artist_name,
  event_date,
  event_date > NOW() as is_upcoming
FROM jambase_events
WHERE title ILIKE '%Goose at Amica Mutual Pavilion%'
ORDER BY event_date ASC;

