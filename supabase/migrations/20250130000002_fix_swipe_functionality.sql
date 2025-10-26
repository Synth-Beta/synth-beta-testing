-- Fix user_swipes table and add missing columns for proper swipe functionality
-- This migration ensures the swipe functionality works correctly

-- First, check if user_swipes table exists and has the right structure
DO $$ 
BEGIN
    -- Create user_swipes table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_swipes') THEN
        CREATE TABLE user_swipes (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            swiper_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            swiped_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            event_id UUID NOT NULL REFERENCES jambase_events(id) ON DELETE CASCADE,
            is_interested BOOLEAN NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(swiper_user_id, swiped_user_id, event_id)
        );
    END IF;
END $$;

-- Add missing columns if they don't exist
ALTER TABLE user_swipes ADD COLUMN IF NOT EXISTS swiper_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_swipes ADD COLUMN IF NOT EXISTS swiped_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_swipes ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES jambase_events(id) ON DELETE CASCADE;
ALTER TABLE user_swipes ADD COLUMN IF NOT EXISTS is_interested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_swipes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_swipes_swiper ON user_swipes(swiper_user_id);
CREATE INDEX IF NOT EXISTS idx_user_swipes_swiped ON user_swipes(swiped_user_id);
CREATE INDEX IF NOT EXISTS idx_user_swipes_event ON user_swipes(event_id);
CREATE INDEX IF NOT EXISTS idx_user_swipes_unique ON user_swipes(swiper_user_id, swiped_user_id, event_id);

-- Enable RLS
ALTER TABLE user_swipes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view their own swipes" ON user_swipes;
DROP POLICY IF EXISTS "Users can create their own swipes" ON user_swipes;
DROP POLICY IF EXISTS "Users can view swipes involving them" ON user_swipes;

CREATE POLICY "Users can view swipes involving them" 
ON user_swipes FOR SELECT 
USING (auth.uid() = swiper_user_id OR auth.uid() = swiped_user_id);

CREATE POLICY "Users can create their own swipes" 
ON user_swipes FOR INSERT 
WITH CHECK (auth.uid() = swiper_user_id);

CREATE POLICY "Users can update their own swipes" 
ON user_swipes FOR UPDATE 
USING (auth.uid() = swiper_user_id) 
WITH CHECK (auth.uid() = swiper_user_id);

-- Create matches table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'matches') THEN
        CREATE TABLE matches (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            event_id UUID NOT NULL REFERENCES jambase_events(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user1_id, user2_id, event_id)
        );
    END IF;
END $$;

-- Enable RLS for matches
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for matches
DROP POLICY IF EXISTS "Users can view their matches" ON matches;
DROP POLICY IF EXISTS "Users can create matches" ON matches;

CREATE POLICY "Users can view their matches" 
ON matches FOR SELECT 
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create matches" 
ON matches FOR INSERT 
WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Create function to check for mutual swipes and create matches
CREATE OR REPLACE FUNCTION check_for_match()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if there's a mutual swipe (both users swiped right on each other)
    IF EXISTS (
        SELECT 1 FROM user_swipes 
        WHERE swiper_user_id = NEW.swiped_user_id 
        AND swiped_user_id = NEW.swiper_user_id 
        AND event_id = NEW.event_id 
        AND is_interested = true
    ) AND NEW.is_interested = true THEN
        -- Create a match
        INSERT INTO matches (user1_id, user2_id, event_id)
        VALUES (
            LEAST(NEW.swiper_user_id, NEW.swiped_user_id),
            GREATEST(NEW.swiper_user_id, NEW.swiped_user_id),
            NEW.event_id
        )
        ON CONFLICT (user1_id, user2_id, event_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically create matches
DROP TRIGGER IF EXISTS trigger_check_match ON user_swipes;
CREATE TRIGGER trigger_check_match
    AFTER INSERT ON user_swipes
    FOR EACH ROW
    EXECUTE FUNCTION check_for_match();
