-- ============================================
-- AUTO-CLAIM CREATOR EVENTS
-- ============================================
-- This migration ensures that all events created by creators are automatically claimed
-- and creates the necessary claim records

-- Step 1: Update existing events created by creators to be auto-claimed
UPDATE public.jambase_events 
SET claimed_by_creator_id = created_by_user_id
WHERE created_by_user_id IS NOT NULL 
  AND owned_by_account_type = 'creator'
  AND claimed_by_creator_id IS NULL;

-- Step 2: Create claim records for existing creator events that don't have them
INSERT INTO public.event_claims (
  event_id,
  claimer_user_id,
  claim_reason,
  verification_proof,
  claim_status,
  reviewed_by_admin_id,
  reviewed_at,
  admin_notes,
  created_at,
  updated_at
)
SELECT 
  je.id as event_id,
  je.created_by_user_id as claimer_user_id,
  'Event created by creator (auto-claimed)' as claim_reason,
  NULL as verification_proof,
  'approved' as claim_status,
  NULL as reviewed_by_admin_id,
  je.created_at as reviewed_at,
  'Auto-approved: Event created by creator' as admin_notes,
  je.created_at,
  je.updated_at
FROM public.jambase_events je
WHERE je.owned_by_account_type = 'creator'
  AND je.created_by_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_claims ec 
    WHERE ec.event_id = je.id 
    AND ec.claimer_user_id = je.created_by_user_id
  );

-- Step 3: Create a function to ensure future creator events are auto-claimed
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
    
    -- Create the claim record
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
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 4: Create trigger to auto-claim creator events
DROP TRIGGER IF EXISTS auto_claim_creator_events_trigger ON public.jambase_events;
CREATE TRIGGER auto_claim_creator_events_trigger
  BEFORE INSERT ON public.jambase_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_claim_creator_events();

-- Step 5: Add helpful comments
COMMENT ON FUNCTION public.auto_claim_creator_events IS 'Automatically claims events created by creators';
COMMENT ON TRIGGER auto_claim_creator_events_trigger ON public.jambase_events IS 'Ensures creator-created events are automatically claimed';
