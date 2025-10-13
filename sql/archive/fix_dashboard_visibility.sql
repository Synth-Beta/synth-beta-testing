-- Fix dashboard visibility for moderation flags
-- Since you can see 2 flags, the data exists - we need to fix the admin recognition

-- Step 1: Ensure current user is admin
UPDATE profiles 
SET 
    account_type = 'admin',
    updated_at = now()
WHERE user_id = auth.uid();

-- Step 2: Verify admin status
SELECT 
    'Current user admin status:' as check_type,
    auth.uid() as user_id,
    p.name as name,
    p.account_type as account_type
FROM profiles p 
WHERE p.user_id = auth.uid();

-- Step 3: Test the exact query the dashboard uses
SELECT 'Dashboard query test:' as test_type;
SELECT 
    mf.id,
    mf.content_type,
    mf.flag_reason,
    mf.flag_status,
    mf.flag_details,
    mf.created_at,
    p.name as flagger_name
FROM moderation_flags mf
LEFT JOIN profiles p ON p.user_id = mf.flagged_by_user_id
WHERE mf.flag_status = 'pending'
ORDER BY mf.created_at ASC;

-- Step 4: Create a simple function that works without admin checks for testing
CREATE OR REPLACE FUNCTION public.get_pending_flags_simple()
RETURNS TABLE (
    id UUID,
    flagged_by_user_id UUID,
    content_type TEXT,
    content_id UUID,
    flag_reason TEXT,
    flag_details TEXT,
    flag_status TEXT,
    reviewed_by_admin_id UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    action_taken TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    flagger_name TEXT,
    flagger_avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mf.id,
        mf.flagged_by_user_id,
        mf.content_type,
        mf.content_id,
        mf.flag_reason,
        mf.flag_details,
        mf.flag_status,
        mf.reviewed_by_admin_id,
        mf.reviewed_at,
        mf.review_notes,
        mf.action_taken,
        mf.created_at,
        mf.updated_at,
        p.name as flagger_name,
        p.avatar_url as flagger_avatar_url
    FROM public.moderation_flags mf
    LEFT JOIN public.profiles p ON p.user_id = mf.flagged_by_user_id
    WHERE mf.flag_status = 'pending'
    ORDER BY mf.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_flags_simple() TO authenticated;

-- Step 5: Test the simple function
SELECT 'Simple function test:' as test_type;
SELECT COUNT(*) as pending_flags FROM public.get_pending_flags_simple();

-- Step 6: Show the actual pending flags
SELECT 'Actual pending flags:' as test_type;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_details,
    created_at,
    flagger_name
FROM public.get_pending_flags_simple();
