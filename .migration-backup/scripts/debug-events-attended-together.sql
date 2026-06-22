-- ============================================
-- Debug: Events attended together (Path B - event_id IS NULL)
-- Users: 349bda34 (current) and 690d27ae (tejpatel1510)
-- ============================================
-- Run in Supabase SQL Editor to verify Path B logic returns the shared event.
-- ============================================

-- 1. Verify reviews exist with matching artist_id, venue_id, Event_date
SELECT
  r1.id AS r1_id,
  r1.user_id AS r1_user,
  r2.id AS r2_id,
  r2.user_id AS r2_user,
  r1.artist_id,
  r1.venue_id,
  r1."Event_date" AS r1_event_date,
  r2."Event_date" AS r2_event_date,
  (r1."Event_date")::date = (r2."Event_date")::date AS dates_match,
  r1.event_id IS NULL AS r1_no_event,
  r2.event_id IS NULL AS r2_no_event
FROM public.reviews r1
INNER JOIN public.reviews r2 ON r2.user_id = '690d27ae-d803-4ff5-a381-162f8863dd9b'::uuid AND r2.is_draft = false
  AND r2.artist_id IS NOT NULL AND r2.venue_id IS NOT NULL AND r2."Event_date" IS NOT NULL
  AND r1.artist_id = r2.artist_id
  AND r1.venue_id = r2.venue_id
  AND ABS((r1."Event_date")::date - (r2."Event_date")::date) <= 30
WHERE r1.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'::uuid
  AND r1.event_id IS NULL AND r1.is_draft = false
  AND r1.artist_id IS NOT NULL AND r1.venue_id IS NOT NULL AND r1."Event_date" IS NOT NULL
  AND (r1.was_there = true OR (r1.review_text IS NOT NULL AND r1.review_text != 'ATTENDANCE_ONLY'))
  AND (r2.was_there = true OR (r2.review_text IS NOT NULL AND r2.review_text != 'ATTENDANCE_ONLY'));

-- 2. Check if "Event_date" column exists (case-sensitive - might be event_date)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reviews'
  AND column_name ILIKE '%event%date%';

-- 3. Call RPC as user 349 (requires setting role - may not work in SQL editor)
-- If using Supabase Dashboard, run this after signing in as 349bda34 in the app:
-- SELECT get_new_friend_celebration_data('690d27ae-d803-4ff5-a381-162f8863dd9b'::uuid)->'events_attended_together' AS events_attended;

-- 4. Check migration status - is 20260221000000 applied?
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE name LIKE '%20260221%'
ORDER BY version DESC;
