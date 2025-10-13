-- Fix moderation flags visibility issue
-- This ensures the real moderation data is visible in the dashboard

-- Step 1: Ensure the user who created the flags has admin privileges
-- Update the user who created the flags to be an admin
UPDATE public.profiles 
SET 
    account_type = 'admin',
    updated_at = now()
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- Step 2: Verify the flags exist and are in the correct state
SELECT 'Verifying flags exist:' as step;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    flag_details,
    created_at
FROM public.moderation_flags 
WHERE id IN ('789f225e-0fbe-4c32-814e-09a4d69b8386', 'e9c1712e-87a1-4689-9120-e8ad36f3d61a');

-- Step 3: Ensure RLS policies allow admin access
-- Drop and recreate admin policies to ensure they work
DROP POLICY IF EXISTS "Admins can view all flags" ON public.moderation_flags;
CREATE POLICY "Admins can view all flags" ON public.moderation_flags
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = auth.uid()
            AND account_type = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update flags" ON public.moderation_flags;
CREATE POLICY "Admins can update flags" ON public.moderation_flags
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = auth.uid()
            AND account_type = 'admin'
        )
    );

-- Step 4: Create a function to get pending flags for admins
CREATE OR REPLACE FUNCTION public.get_pending_moderation_flags()
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
    -- Check if user is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
        AND account_type = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only admins can view pending moderation flags';
    END IF;
    
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

GRANT EXECUTE ON FUNCTION public.get_pending_moderation_flags() TO authenticated;

-- Step 5: Test the function
SELECT 'Testing pending flags function:' as step;
SELECT COUNT(*) as pending_flags_count FROM public.get_pending_moderation_flags();

-- Step 6: Show all pending flags with details
SELECT 'All pending flags:' as step;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_details,
    created_at,
    flagger_name
FROM public.get_pending_moderation_flags();

-- Step 7: Verify the dashboard query works
SELECT 'Dashboard query verification:' as step;
SELECT 
    mf.id,
    mf.content_type,
    mf.flag_reason,
    mf.flag_status,
    mf.flag_details,
    mf.created_at,
    p.name as flagger_name
FROM public.moderation_flags mf
LEFT JOIN public.profiles p ON p.user_id = mf.flagged_by_user_id
WHERE mf.flag_status = 'pending'
ORDER BY mf.created_at ASC;

-- Step 8: Final status
SELECT 'Moderation visibility fix completed!' as status;
