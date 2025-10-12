-- Check what tables and enums actually exist
-- Run this in Supabase SQL Editor

-- 1. Check all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Check all custom types/enums
SELECT typname as enum_name
FROM pg_type 
WHERE typtype = 'e'
ORDER BY typname;

-- 3. Check if moderation_flags table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'moderation_flags'
) as moderation_flags_exists;

-- 4. Check if admin_actions table exists  
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'admin_actions'
) as admin_actions_exists;

-- 5. Check if event_promotions table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'event_promotions'
) as event_promotions_exists;