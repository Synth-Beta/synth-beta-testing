-- Enhance user_streaming_stats_summary table to support time ranges
-- This allows storing stats for different time periods (week, month, 3mo, 6mo, year, 5yr, all time)

-- Add time_range column to support multiple time periods
ALTER TABLE user_streaming_stats_summary 
ADD COLUMN IF NOT EXISTS time_range TEXT DEFAULT 'all_time' 
CHECK (time_range IN ('last_day', 'last_week', 'last_month', 'last_3_months', 'last_6_months', 'last_year', 'last_3_years', 'last_5_years', 'all_time'));

-- Update unique constraint to include time_range
-- First, drop the old constraint if it exists
ALTER TABLE user_streaming_stats_summary 
DROP CONSTRAINT IF EXISTS user_streaming_stats_summary_user_id_service_type_key;

-- Add new unique constraint with time_range
ALTER TABLE user_streaming_stats_summary 
ADD CONSTRAINT user_streaming_stats_summary_user_service_time_unique 
UNIQUE(user_id, service_type, time_range);

-- Add index for time_range queries
CREATE INDEX IF NOT EXISTS user_streaming_stats_summary_time_range_idx 
ON user_streaming_stats_summary(time_range);

-- Add columns for more comprehensive stats
ALTER TABLE user_streaming_stats_summary 
ADD COLUMN IF NOT EXISTS top_tracks JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS top_albums JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS recently_played JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS total_albums INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_track_popularity DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_artist_popularity DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS most_played_artist TEXT,
ADD COLUMN IF NOT EXISTS most_played_track TEXT,
ADD COLUMN IF NOT EXISTS total_playlists INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN user_streaming_stats_summary.time_range IS 'Time period for these stats: last_day, last_week, last_month, last_3_months, last_6_months, last_year, last_3_years, last_5_years, all_time';
COMMENT ON COLUMN user_streaming_stats_summary.top_tracks IS 'JSON array of top tracks with names, artists, and popularity';
COMMENT ON COLUMN user_streaming_stats_summary.top_albums IS 'JSON array of top albums';
COMMENT ON COLUMN user_streaming_stats_summary.recently_played IS 'JSON array of recently played tracks';

-- Verify table structure
SELECT 
    'Table enhanced successfully!' as status,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_streaming_stats_summary';


