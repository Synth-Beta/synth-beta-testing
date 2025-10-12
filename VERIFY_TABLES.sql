-- Run this in Supabase SQL Editor to verify all tables exist

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'event_claims',
  'event_tickets', 
  'event_promotions',
  'admin_actions',
  'moderation_flags',
  'user_blocks',
  'event_groups',
  'event_group_members',
  'event_photos',
  'event_photo_likes',
  'event_photo_comments'
)
ORDER BY table_name;

