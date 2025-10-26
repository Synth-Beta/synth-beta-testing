-- Quick fix for ON CONFLICT constraint error in triggers
-- This can be applied manually to fix the immediate issue

-- Fix the auto_claim_creator_events trigger function
CREATE OR REPLACE FUNCTION public.auto_claim_creator_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If this is a creator creating an event, auto-claim it
  IF NEW.owned_by_account_type = 'creator' AND NEW.created_by_user_id IS NOT NULL THEN
    -- Set the claimed_by_creator_id
    NEW.claimed_by_creator_id := NEW.created_by_user_id;
    
    -- Create the claim record with proper conflict handling
    BEGIN
      INSERT INTO public.event_claims (
        event_id,
        claimer_user_id,
        claim_reason,
        verification_proof,
        claim_status,
        reviewed_by_admin_id,
        reviewed_at,
        admin_notes
      ) VALUES (
        NEW.id,
        NEW.created_by_user_id,
        'Event created by creator',
        NULL,
        'approved',
        NULL,
        NEW.created_at,
        'Auto-approved: Event created by creator'
      );
    EXCEPTION WHEN unique_violation THEN
      -- Claim already exists, do nothing
      NULL;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix the trigger_event_creation_analytics function
CREATE OR REPLACE FUNCTION public.trigger_event_creation_analytics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert analytics for the new event with proper error handling
  BEGIN
    INSERT INTO public.analytics_event_daily (
      event_id,
      date,
      impressions,
      unique_viewers,
      clicks,
      interested_count,
      review_count,
      likes_count,
      comments_count,
      shares_count,
      ticket_link_clicks
    ) VALUES (
      NEW.id,
      CURRENT_DATE,
      0, 0, 0, 0, 0, 0, 0, 0, 0
    );
  EXCEPTION WHEN unique_violation THEN
    -- Analytics already exist for this event/date, do nothing
    NULL;
  END;
  
  RETURN NEW;
END;
$$;
