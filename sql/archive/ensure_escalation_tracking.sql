-- Ensure all escalated content is properly catalogued for review
-- This creates a comprehensive tracking system for all moderation actions

-- Step 1: Create a view for all moderation activities (pending and resolved)
CREATE OR REPLACE VIEW public.moderation_activities AS
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
    p.avatar_url as flagger_avatar_url,
    admin_p.name as reviewer_name,
    admin_p.avatar_url as reviewer_avatar_url,
    -- Add escalation tracking fields
    CASE 
        WHEN mf.flag_status = 'pending' THEN 'needs_review'
        WHEN mf.flag_status = 'resolved' AND mf.action_taken IN ('remove', 'warn') THEN 'escalated_resolved'
        WHEN mf.flag_status = 'dismissed' THEN 'escalated_dismissed'
        ELSE 'unknown_status'
    END as escalation_status,
    -- Track response time
    CASE 
        WHEN mf.reviewed_at IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (mf.reviewed_at - mf.created_at)) / 3600 -- hours
        ELSE NULL
    END as response_time_hours,
    -- Priority based on flag reason
    CASE mf.flag_reason
        WHEN 'harassment' THEN 'high'
        WHEN 'inappropriate_content' THEN 'high'
        WHEN 'spam' THEN 'medium'
        WHEN 'misinformation' THEN 'medium'
        WHEN 'copyright_violation' THEN 'high'
        WHEN 'fake_event' THEN 'high'
        ELSE 'low'
    END as priority_level
FROM public.moderation_flags mf
LEFT JOIN public.profiles p ON p.user_id = mf.flagged_by_user_id
LEFT JOIN public.profiles admin_p ON admin_p.user_id = mf.reviewed_by_admin_id;

-- Step 2: Create a function to get all escalated content for review
CREATE OR REPLACE FUNCTION public.get_all_escalated_content()
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
    flagger_avatar_url TEXT,
    reviewer_name TEXT,
    reviewer_avatar_url TEXT,
    escalation_status TEXT,
    response_time_hours NUMERIC,
    priority_level TEXT
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
        RAISE EXCEPTION 'Only admins can view escalated content';
    END IF;
    
    RETURN QUERY
    SELECT * FROM public.moderation_activities
    ORDER BY 
        CASE priority_level
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
        END,
        created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_escalated_content() TO authenticated;

-- Step 3: Create a function to get escalation statistics
CREATE OR REPLACE FUNCTION public.get_escalation_stats()
RETURNS TABLE (
    total_escalations BIGINT,
    pending_review BIGINT,
    resolved_escalations BIGINT,
    dismissed_escalations BIGINT,
    avg_response_time_hours NUMERIC,
    high_priority_pending BIGINT,
    medium_priority_pending BIGINT,
    low_priority_pending BIGINT
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
        RAISE EXCEPTION 'Only admins can view escalation statistics';
    END IF;
    
    RETURN QUERY
    SELECT 
        COUNT(*) as total_escalations,
        COUNT(*) FILTER (WHERE flag_status = 'pending') as pending_review,
        COUNT(*) FILTER (WHERE flag_status = 'resolved') as resolved_escalations,
        COUNT(*) FILTER (WHERE flag_status = 'dismissed') as dismissed_escalations,
        ROUND(AVG(response_time_hours), 2) as avg_response_time_hours,
        COUNT(*) FILTER (WHERE flag_status = 'pending' AND priority_level = 'high') as high_priority_pending,
        COUNT(*) FILTER (WHERE flag_status = 'pending' AND priority_level = 'medium') as medium_priority_pending,
        COUNT(*) FILTER (WHERE flag_status = 'pending' AND priority_level = 'low') as low_priority_pending
    FROM public.moderation_activities;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_escalation_stats() TO authenticated;

-- Step 4: Create an audit log for all moderation actions
CREATE OR REPLACE FUNCTION public.log_moderation_action(
    p_flag_id UUID,
    p_action TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_flag RECORD;
BEGIN
    -- Check if user is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
        AND account_type = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only admins can log moderation actions';
    END IF;
    
    -- Get flag details
    SELECT * INTO v_flag FROM public.moderation_flags WHERE id = p_flag_id;
    
    IF v_flag.id IS NULL THEN
        RAISE EXCEPTION 'Flag not found';
    END IF;
    
    -- Log to admin_actions table
    INSERT INTO public.admin_actions (
        admin_user_id,
        action_type,
        target_type,
        target_id,
        action_details,
        reason
    ) VALUES (
        auth.uid(),
        'content_moderated',
        v_flag.content_type,
        v_flag.content_id,
        jsonb_build_object(
            'flag_id', p_flag_id,
            'action', p_action,
            'flag_reason', v_flag.flag_reason,
            'notes', p_notes
        ),
        p_notes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_moderation_action(UUID, TEXT, TEXT) TO authenticated;

-- Step 5: Test the escalation tracking
SELECT 'Escalation tracking system created successfully!' as status;

-- Step 6: Show current escalation statistics
SELECT 'Current escalation statistics:' as info;
SELECT * FROM public.get_escalation_stats();

-- Step 7: Show all escalated content
SELECT 'All escalated content:' as info;
SELECT 
    id,
    content_type,
    flag_reason,
    flag_status,
    escalation_status,
    priority_level,
    created_at,
    response_time_hours
FROM public.get_all_escalated_content()
ORDER BY 
    CASE priority_level
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
    END,
    created_at ASC;
