-- Create user_streaming_stats_summary table for recommendation system
-- Run this SQL in your Supabase Dashboard SQL Editor

CREATE TABLE IF NOT EXISTS user_streaming_stats_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('spotify', 'apple-music')),
    top_artists JSONB NOT NULL DEFAULT '[]',
    top_genres JSONB NOT NULL DEFAULT '[]',
    total_tracks INTEGER DEFAULT 0,
    unique_artists INTEGER DEFAULT 0,
    total_listening_hours DECIMAL(10,2) DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one summary per user per service
    UNIQUE(user_id, service_type)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS user_streaming_stats_summary_user_id_idx ON user_streaming_stats_summary(user_id);
CREATE INDEX IF NOT EXISTS user_streaming_stats_summary_service_type_idx ON user_streaming_stats_summary(service_type);
CREATE INDEX IF NOT EXISTS user_streaming_stats_summary_last_updated_idx ON user_streaming_stats_summary(last_updated);

-- Enable Row Level Security (RLS)
ALTER TABLE user_streaming_stats_summary ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only access their own streaming stats
CREATE POLICY "Users can view their own streaming stats" ON user_streaming_stats_summary
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streaming stats" ON user_streaming_stats_summary
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streaming stats" ON user_streaming_stats_summary
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own streaming stats" ON user_streaming_stats_summary
    FOR DELETE USING (auth.uid() = user_id);

-- Add helpful comments
COMMENT ON TABLE user_streaming_stats_summary IS 'Summary of user streaming statistics for recommendation system';
COMMENT ON COLUMN user_streaming_stats_summary.service_type IS 'Type of streaming service (spotify, apple-music)';
COMMENT ON COLUMN user_streaming_stats_summary.top_artists IS 'JSON array of top artists with names and popularity scores';
COMMENT ON COLUMN user_streaming_stats_summary.top_genres IS 'JSON array of top genres with counts';
COMMENT ON COLUMN user_streaming_stats_summary.total_tracks IS 'Total number of tracks listened to';
COMMENT ON COLUMN user_streaming_stats_summary.unique_artists IS 'Number of unique artists listened to';
COMMENT ON COLUMN user_streaming_stats_summary.total_listening_hours IS 'Estimated total listening hours';

-- Create a function to update the last_updated timestamp
CREATE OR REPLACE FUNCTION update_user_streaming_stats_summary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update last_updated
CREATE TRIGGER update_user_streaming_stats_summary_updated_at
    BEFORE UPDATE ON user_streaming_stats_summary
    FOR EACH ROW
    EXECUTE FUNCTION update_user_streaming_stats_summary_updated_at();

-- Create a function to get user's top artists for recommendations
CREATE OR REPLACE FUNCTION get_user_top_artists_for_recommendations(
    user_uuid UUID,
    service TEXT DEFAULT 'spotify',
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE(
    artist_name TEXT,
    popularity_score INTEGER,
    service_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (jsonb_array_elements(uss.top_artists)->>'name')::TEXT as artist_name,
        (jsonb_array_elements(uss.top_artists)->>'popularity')::INTEGER as popularity_score,
        uss.service_type
    FROM user_streaming_stats_summary uss
    WHERE uss.user_id = user_uuid 
    AND uss.service_type = service
    ORDER BY (jsonb_array_elements(uss.top_artists)->>'popularity')::INTEGER DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions for the function
GRANT EXECUTE ON FUNCTION get_user_top_artists_for_recommendations(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_top_artists_for_recommendations(UUID, TEXT, INTEGER) TO anon;

-- Verify table was created
SELECT 
    'Table created successfully!' as status,
    COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'user_streaming_stats_summary';

