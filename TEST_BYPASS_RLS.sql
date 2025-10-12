-- Test bypassing RLS to see if data exists
-- Run this in Supabase SQL Editor

-- 1. Test moderation_flags without RLS
SET row_security = off;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    created_at
FROM moderation_flags 
ORDER BY created_at DESC;
SET row_security = on;

-- 2. Test event_claims without RLS
SET row_security = off;
SELECT 
    id,
    claim_status,
    claimed_by_user_id,
    created_at
FROM event_claims 
ORDER BY created_at DESC;
SET row_security = on;

-- 3. Check if event_claims table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'event_claims'
) as event_claims_exists;
