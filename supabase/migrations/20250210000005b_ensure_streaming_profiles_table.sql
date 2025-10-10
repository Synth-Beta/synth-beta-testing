-- ============================================================
-- Ensure streaming_profiles table exists before creating trigger
-- This reruns the streaming_profiles creation if it doesn't exist
-- ============================================================

-- Create streaming_profiles table (idempotent with IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS streaming_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('spotify', 'apple-music')),
    profile_data JSONB NOT NULL,
    sync_status TEXT DEFAULT 'completed' CHECK (sync_status IN ('pending', 'syncing', 'completed', 'error')),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one profile per user per service
    UNIQUE(user_id, service_type)
);

-- Add indexes (IF NOT EXISTS for safety)
CREATE INDEX IF NOT EXISTS streaming_profiles_user_id_idx ON streaming_profiles(user_id);
CREATE INDEX IF NOT EXISTS streaming_profiles_service_type_idx ON streaming_profiles(service_type);
CREATE INDEX IF NOT EXISTS streaming_profiles_last_updated_idx ON streaming_profiles(last_updated);
CREATE INDEX IF NOT EXISTS streaming_profiles_sync_status_idx ON streaming_profiles(sync_status);

-- Enable Row Level Security
ALTER TABLE streaming_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view their own streaming profiles" ON streaming_profiles;
DROP POLICY IF EXISTS "Users can insert their own streaming profiles" ON streaming_profiles;
DROP POLICY IF EXISTS "Users can update their own streaming profiles" ON streaming_profiles;
DROP POLICY IF EXISTS "Users can delete their own streaming profiles" ON streaming_profiles;
DROP POLICY IF EXISTS "Allow anonymous access for streaming profiles" ON streaming_profiles;

-- Create RLS policies
CREATE POLICY "Users can view their own streaming profiles" ON streaming_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streaming profiles" ON streaming_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streaming profiles" ON streaming_profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own streaming profiles" ON streaming_profiles
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to update last_updated timestamp (idempotent)
CREATE OR REPLACE FUNCTION update_streaming_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$function$;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS update_streaming_profiles_updated_at ON streaming_profiles;
CREATE TRIGGER update_streaming_profiles_updated_at
    BEFORE UPDATE ON streaming_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_streaming_profiles_updated_at();

-- Add comments
COMMENT ON TABLE streaming_profiles IS 'Stores user streaming service profile data and sync status (user_id maps to auth.users)';
COMMENT ON COLUMN streaming_profiles.user_id IS 'Foreign key to auth.users(id) - the user who owns this streaming profile';
COMMENT ON COLUMN streaming_profiles.service_type IS 'Type of streaming service (spotify, apple-music)';
COMMENT ON COLUMN streaming_profiles.profile_data IS 'JSON data containing user profile information from the streaming service';

