-- ============================================
-- STEP 15C: CHECK email_gate_entries STRUCTURE
-- ============================================
-- Check structure and purpose of email_gate_entries table

SELECT 
  'email_gate_entries Structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'email_gate_entries'
ORDER BY ordinal_position;

-- Show sample data
SELECT 
  'email_gate_entries Sample' as check_type,
  *
FROM public.email_gate_entries
LIMIT 5;

