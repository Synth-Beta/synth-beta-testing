-- Run this in Supabase SQL Editor to reload the schema cache
-- This forces PostgREST to recognize the new tables and relationships

NOTIFY pgrst, 'reload schema';

-- Alternative method (if above doesn't work):
-- You can also just run any simple query and it will help refresh:
SELECT 1;

-- Verify your new tables are recognized:
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'event_claims',
  'moderation_flags',
  'event_promotions',
  'user_blocks',
  'event_groups',
  'event_photos'
)
ORDER BY table_name;

