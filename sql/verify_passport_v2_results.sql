-- Verify passport entries were created
SELECT 
  COUNT(*) as total_passport_entries,
  COUNT(*) FILTER (WHERE type = 'city') as cities,
  COUNT(*) FILTER (WHERE type = 'venue') as venues,
  COUNT(*) FILTER (WHERE type = 'artist') as artists,
  COUNT(*) FILTER (WHERE type = 'scene') as scenes
FROM public.passport_entries;

-- See actual entries
SELECT 
  type,
  entity_name,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) as total_entries
FROM public.passport_entries
GROUP BY type, entity_name
ORDER BY type, COUNT(*) DESC;

-- Check specific user's entries
SELECT 
  pe.type,
  pe.entity_name,
  pe.unlocked_at
FROM public.passport_entries pe
WHERE pe.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'  -- Replace with your user_id if different
ORDER BY pe.type, pe.unlocked_at DESC;

