-- Create the moderation system tables and enums
-- Run this in Supabase SQL Editor

-- 1. Create the enums first
CREATE TYPE flag_status_enum AS ENUM ('pending', 'resolved', 'dismissed');
CREATE TYPE moderation_entity_type_enum AS ENUM ('event', 'review', 'profile', 'comment');
CREATE TYPE moderation_flag_type_enum AS ENUM ('spam', 'inappropriate_content', 'harassment_bullying', 'false_information', 'copyright_violation', 'fake_fraudulent_event');

-- 2. Create moderation_flags table
CREATE TABLE IF NOT EXISTS moderation_flags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content_type moderation_entity_type_enum NOT NULL,
    content_id UUID NOT NULL,
    flag_reason moderation_flag_type_enum NOT NULL,
    flag_details TEXT,
    flagged_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    flag_status flag_status_enum DEFAULT 'pending' NOT NULL,
    reviewed_by_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. Create admin_actions table
CREATE TABLE IF NOT EXISTS admin_actions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_type TEXT NOT NULL CHECK (action_type IN ('content_removed', 'user_warned', 'user_banned', 'content_approved', 'flag_dismissed')),
    target_type TEXT NOT NULL CHECK (target_type IN ('event', 'review', 'profile', 'comment', 'user')),
    target_id UUID NOT NULL,
    admin_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_moderation_flags_status ON moderation_flags(flag_status);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_content ON moderation_flags(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_flagged_by ON moderation_flags(flagged_by_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target_type, target_id);

-- 5. Enable RLS
ALTER TABLE moderation_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
-- Admins can see all flags
CREATE POLICY "Admins can view all moderation flags" ON moderation_flags
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND account_type = 'admin'
        )
    );

-- Admins can update flags
CREATE POLICY "Admins can update moderation flags" ON moderation_flags
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND account_type = 'admin'
        )
    );

-- Users can create flags
CREATE POLICY "Users can create moderation flags" ON moderation_flags
    FOR INSERT WITH CHECK (auth.uid() = flagged_by_user_id);

-- Admins can see all admin actions
CREATE POLICY "Admins can view admin actions" ON admin_actions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND account_type = 'admin'
        )
    );

-- Admins can create admin actions
CREATE POLICY "Admins can create admin actions" ON admin_actions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND account_type = 'admin'
        )
    );

-- 7. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_moderation_flags_updated_at 
    BEFORE UPDATE ON moderation_flags 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Test the setup
SELECT 'Moderation system created successfully!' as status;
