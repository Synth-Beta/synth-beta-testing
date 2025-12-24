-- Quick verification: Check if passport entries were created
SELECT 
  COUNT(*) as total_passport_entries,
  COUNT(*) FILTER (WHERE type = 'city') as cities,
  COUNT(*) FILTER (WHERE type = 'venue') as venues,
  COUNT(*) FILTER (WHERE type = 'artist') as artists,
  COUNT(*) FILTER (WHERE type = 'scene') as scenes
FROM public.passport_entries;

-- See sample entries by type
SELECT 
  type,
  entity_name,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) as total_entries
FROM public.passport_entries
GROUP BY type, entity_name
ORDER BY type, COUNT(*) DESC
LIMIT 20;

-- Check entries for a specific user (replace with your user_id)
-- SELECT 
--   pe.*
-- FROM public.passport_entries pe
-- WHERE pe.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'  -- Replace with your user_id
-- ORDER BY pe.type, pe.unlocked_at DESC;

