-- Create streaming_profiles table for storing user streaming service data
CREATE TABLE IF NOT EXISTS streaming_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('spotify', 'apple-music')),
    profile_data JSONB NOT NULL,
    sync_status TEXT DEFAULT 'completed' CHECK (sync_status IN ('pending', 'syncing', 'completed', 'error')),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one profile per user per service
    UNIQUE(user_id, service_type)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS streaming_profiles_user_id_idx ON streaming_profiles(user_id);
CREATE INDEX IF NOT EXISTS streaming_profiles_service_type_idx ON streaming_profiles(service_type);
CREATE INDEX IF NOT EXISTS streaming_profiles_last_updated_idx ON streaming_profiles(last_updated);
CREATE INDEX IF NOT EXISTS streaming_profiles_sync_status_idx ON streaming_profiles(sync_status);

-- Enable Row Level Security (RLS)
ALTER TABLE streaming_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only access their own streaming profiles
CREATE POLICY "Users can view their own streaming profiles" ON streaming_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streaming profiles" ON streaming_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streaming profiles" ON streaming_profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own streaming profiles" ON streaming_profiles
    FOR DELETE USING (auth.uid() = user_id);

-- Allow anonymous access for now (for testing)
CREATE POLICY "Allow anonymous access for streaming profiles" ON streaming_profiles
    FOR ALL USING (user_id IS NULL OR user_id::text = 'anonymous');

-- Add helpful comments
COMMENT ON TABLE streaming_profiles IS 'Stores user streaming service profile data and sync status';
COMMENT ON COLUMN streaming_profiles.service_type IS 'Type of streaming service (spotify, apple-music)';
COMMENT ON COLUMN streaming_profiles.profile_data IS 'JSON data containing user profile information from the streaming service';
COMMENT ON COLUMN streaming_profiles.sync_status IS 'Current synchronization status';
COMMENT ON COLUMN streaming_profiles.last_updated IS 'Timestamp of last profile data update';

-- Create a function to update the last_updated timestamp
CREATE OR REPLACE FUNCTION update_streaming_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update last_updated
CREATE TRIGGER update_streaming_profiles_updated_at
    BEFORE UPDATE ON streaming_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_streaming_profiles_updated_at();
