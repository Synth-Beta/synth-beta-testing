-- Create user_settings_preferences table for storing user notification and preference settings
CREATE TABLE IF NOT EXISTS user_settings_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Notification Preferences (TRUE/FALSE toggles)
    enable_push_notifications BOOLEAN DEFAULT true NOT NULL,
    enable_emails BOOLEAN DEFAULT true NOT NULL,
    
    -- Privacy Preferences
    is_public_profile BOOLEAN DEFAULT true NOT NULL,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS user_settings_preferences_user_id_idx ON user_settings_preferences(user_id);

-- Enable Row Level Security
ALTER TABLE user_settings_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own preferences
CREATE POLICY "Users can view their own settings preferences"
    ON user_settings_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings preferences"
    ON user_settings_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings preferences"
    ON user_settings_preferences FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings preferences"
    ON user_settings_preferences FOR DELETE
    USING (auth.uid() = user_id);

-- Function to automatically create settings preferences for new users
CREATE OR REPLACE FUNCTION create_user_settings_preferences_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_settings_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create preferences when a new user signs up
CREATE TRIGGER on_auth_user_created_create_settings_prefs
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_settings_preferences_for_new_user();

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_settings_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp on every update
CREATE TRIGGER update_user_settings_preferences_timestamp
    BEFORE UPDATE ON user_settings_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_settings_preferences_updated_at();

-- Add helpful comments for documentation
COMMENT ON TABLE user_settings_preferences IS 'Stores user notification and privacy preference settings';
COMMENT ON COLUMN user_settings_preferences.enable_push_notifications IS 'Enable/disable push notifications';
COMMENT ON COLUMN user_settings_preferences.enable_emails IS 'Enable/disable email notifications';
COMMENT ON COLUMN user_settings_preferences.is_public_profile IS 'Whether the user profile is public or private';

-- Create settings preferences for all existing users
INSERT INTO user_settings_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

