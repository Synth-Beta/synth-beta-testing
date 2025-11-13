-- Update time_range constraint to include all supported time ranges
-- This fixes the constraint to allow 'last_day' and 'last_3_years' which were missing

-- Drop the existing constraint
ALTER TABLE user_streaming_stats_summary 
DROP CONSTRAINT IF EXISTS user_streaming_stats_summary_time_range_check;

-- Add the updated constraint with all time ranges
ALTER TABLE user_streaming_stats_summary 
ADD CONSTRAINT user_streaming_stats_summary_time_range_check 
CHECK (
  time_range = ANY (
    ARRAY[
      'last_day'::text,
      'last_week'::text,
      'last_month'::text,
      'last_3_months'::text,
      'last_6_months'::text,
      'last_year'::text,
      'last_3_years'::text,
      'last_5_years'::text,
      'all_time'::text
    ]
  )
);

-- Verify the constraint was updated
SELECT 
  'Time range constraint updated successfully!' as status,
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conname = 'user_streaming_stats_summary_time_range_check';

