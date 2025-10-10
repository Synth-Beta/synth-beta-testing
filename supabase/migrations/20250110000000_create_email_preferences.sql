-- Create email_preferences table for storing user email notification settings
CREATE TABLE IF NOT EXISTS email_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Supabase Auth Emails (cannot be disabled, for informational purposes only)
    -- These are always enabled for security reasons
    enable_auth_emails BOOLEAN DEFAULT true NOT NULL,
    
    -- Custom Notification Emails (can be disabled by user)
    enable_event_reminders BOOLEAN DEFAULT true NOT NULL,
    enable_match_notifications BOOLEAN DEFAULT true NOT NULL,
    enable_review_notifications BOOLEAN DEFAULT true NOT NULL,
    enable_weekly_digest BOOLEAN DEFAULT true NOT NULL,
    
    -- Notification preferences
    weekly_digest_day TEXT DEFAULT 'monday' CHECK (
        weekly_digest_day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    ),
    event_reminder_days INTEGER DEFAULT 3 CHECK (
        event_reminder_days >= 0 AND event_reminder_days <= 30
    ),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS email_preferences_user_id_idx ON email_preferences(user_id);

-- Enable Row Level Security
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own preferences
CREATE POLICY "Users can view their own email preferences"
    ON email_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email preferences"
    ON email_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email preferences"
    ON email_preferences FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email preferences"
    ON email_preferences FOR DELETE
    USING (auth.uid() = user_id);

-- Function to automatically create email preferences for new users
CREATE OR REPLACE FUNCTION create_email_preferences_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO email_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create preferences when a new user signs up
CREATE TRIGGER on_auth_user_created_create_email_prefs
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_email_preferences_for_new_user();

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp on every update
CREATE TRIGGER update_email_preferences_timestamp
    BEFORE UPDATE ON email_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_email_preferences_updated_at();

-- Add helpful comments for documentation
COMMENT ON TABLE email_preferences IS 'Stores user email notification preferences and settings';
COMMENT ON COLUMN email_preferences.enable_auth_emails IS 'Display-only: Authentication emails (signup, password reset, etc.) cannot be disabled for security reasons';
COMMENT ON COLUMN email_preferences.enable_event_reminders IS 'Send reminders X days before events user has marked as interested';
COMMENT ON COLUMN email_preferences.enable_match_notifications IS 'Send notifications when user matches with someone at an event';
COMMENT ON COLUMN email_preferences.enable_review_notifications IS 'Send notifications when someone reviews an event user is interested in';
COMMENT ON COLUMN email_preferences.enable_weekly_digest IS 'Send weekly summary email with activity, matches, and recommendations';
COMMENT ON COLUMN email_preferences.weekly_digest_day IS 'Day of week to send the weekly digest email';
COMMENT ON COLUMN email_preferences.event_reminder_days IS 'Number of days before event to send reminder (0-30)';

-- Create email preferences for all existing users
INSERT INTO email_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

