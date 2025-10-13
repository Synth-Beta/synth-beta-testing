-- Create event_claims table if it doesn't exist
-- Run this in Supabase SQL Editor

-- 1. Create the table
CREATE TABLE IF NOT EXISTS event_claims (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    jambase_event_id TEXT NOT NULL,
    claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    claim_status TEXT DEFAULT 'pending' NOT NULL CHECK (claim_status IN ('pending', 'approved', 'rejected')),
    claim_reason TEXT,
    admin_notes TEXT,
    reviewed_by_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_event_claims_status ON event_claims(claim_status);
CREATE INDEX IF NOT EXISTS idx_event_claims_user ON event_claims(claimed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_event_claims_event ON event_claims(jambase_event_id);

-- 3. Enable RLS
ALTER TABLE event_claims ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- Admins can see all claims
CREATE POLICY "Admins can view all event claims" ON event_claims
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND account_type = 'admin'
        )
    );

-- Admins can update claims
CREATE POLICY "Admins can update event claims" ON event_claims
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND account_type = 'admin'
        )
    );

-- Users can create claims
CREATE POLICY "Users can create event claims" ON event_claims
    FOR INSERT WITH CHECK (auth.uid() = claimed_by_user_id);

-- 5. Create updated_at trigger
CREATE TRIGGER update_event_claims_updated_at 
    BEFORE UPDATE ON event_claims 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Test the setup
SELECT 'Event claims table created successfully!' as status;
