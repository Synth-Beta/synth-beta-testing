-- Comprehensive fix for ON CONFLICT constraint error in jambase_events
-- This migration addresses the root cause of the 42P10 error

-- Step 1: Fix the auto_claim_creator_events trigger function to handle conflicts properly
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
    )
    ON CONFLICT (event_id, claimer_user_id)
    DO UPDATE SET
      claim_reason = EXCLUDED.claim_reason,
      claim_status = EXCLUDED.claim_status,
      admin_notes = EXCLUDED.admin_notes,
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 2: Fix the trigger_event_creation_analytics function to handle conflicts
CREATE OR REPLACE FUNCTION public.trigger_event_creation_analytics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert analytics for the new event
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
  )
  ON CONFLICT (event_id, date)
  DO NOTHING; -- Analytics already exist for this event/date
  
  RETURN NEW;
END;
$$;

-- Step 3: Ensure the jambase_event_id unique constraint exists with proper name
DO $$ 
BEGIN
  -- Check if the unique constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'jambase_events_jambase_event_id_key'
    AND conrelid = 'public.jambase_events'::regclass
  ) THEN
    -- Create the unique constraint if it doesn't exist
    ALTER TABLE public.jambase_events 
    ADD CONSTRAINT jambase_events_jambase_event_id_key 
    UNIQUE (jambase_event_id);
  END IF;
END $$;

-- Step 4: Create a safe upsert function for jambase_events
CREATE OR REPLACE FUNCTION public.safe_upsert_jambase_event(event_data JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_id UUID;
  jambase_event_id TEXT;
BEGIN
  -- Extract jambase_event_id from the JSON data
  jambase_event_id := event_data->>'jambase_event_id';
  
  -- Check if event already exists
  SELECT id INTO event_id
  FROM public.jambase_events
  WHERE jambase_events.jambase_event_id = safe_upsert_jambase_event.jambase_event_id;
  
  IF event_id IS NOT NULL THEN
    -- Update existing event
    UPDATE public.jambase_events
    SET 
      title = COALESCE(event_data->>'title', title),
      artist_name = COALESCE(event_data->>'artist_name', artist_name),
      artist_id = COALESCE(event_data->>'artist_id', artist_id),
      venue_name = COALESCE(event_data->>'venue_name', venue_name),
      venue_id = COALESCE(event_data->>'venue_id', venue_id),
      event_date = COALESCE((event_data->>'event_date')::TIMESTAMPTZ, event_date),
      doors_time = COALESCE((event_data->>'doors_time')::TIMESTAMPTZ, doors_time),
      description = COALESCE(event_data->>'description', description),
      genres = COALESCE((event_data->>'genres')::TEXT[], genres),
      venue_address = COALESCE(event_data->>'venue_address', venue_address),
      venue_city = COALESCE(event_data->>'venue_city', venue_city),
      venue_state = COALESCE(event_data->>'venue_state', venue_state),
      venue_zip = COALESCE(event_data->>'venue_zip', venue_zip),
      latitude = COALESCE((event_data->>'latitude')::DECIMAL, latitude),
      longitude = COALESCE((event_data->>'longitude')::DECIMAL, longitude),
      ticket_available = COALESCE((event_data->>'ticket_available')::BOOLEAN, ticket_available),
      price_range = COALESCE(event_data->>'price_range', price_range),
      ticket_urls = COALESCE((event_data->>'ticket_urls')::TEXT[], ticket_urls),
      setlist = COALESCE(event_data->'setlist', setlist),
      tour_name = COALESCE(event_data->>'tour_name', tour_name),
      updated_at = NOW()
    WHERE id = event_id;
  ELSE
    -- Insert new event
    INSERT INTO public.jambase_events (
      jambase_event_id, title, artist_name, artist_id, venue_name, venue_id,
      event_date, doors_time, description, genres, venue_address, venue_city,
      venue_state, venue_zip, latitude, longitude, ticket_available,
      price_range, ticket_urls, setlist, tour_name
    )
    VALUES (
      jambase_event_id,
      event_data->>'title',
      event_data->>'artist_name',
      event_data->>'artist_id',
      event_data->>'venue_name',
      event_data->>'venue_id',
      (event_data->>'event_date')::TIMESTAMPTZ,
      (event_data->>'doors_time')::TIMESTAMPTZ,
      event_data->>'description',
      (event_data->>'genres')::TEXT[],
      event_data->>'venue_address',
      event_data->>'venue_city',
      event_data->>'venue_state',
      event_data->>'venue_zip',
      (event_data->>'latitude')::DECIMAL,
      (event_data->>'longitude')::DECIMAL,
      (event_data->>'ticket_available')::BOOLEAN,
      event_data->>'price_range',
      (event_data->>'ticket_urls')::TEXT[],
      event_data->'setlist',
      event_data->>'tour_name'
    )
    RETURNING id INTO event_id;
  END IF;
  
  RETURN event_id;
END;
$$;

-- Step 5: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.safe_upsert_jambase_event(JSONB) TO authenticated;

-- Step 6: Add helpful comments
COMMENT ON FUNCTION public.auto_claim_creator_events IS 'Fixed to handle ON CONFLICT properly in event_claims table';
COMMENT ON FUNCTION public.trigger_event_creation_analytics IS 'Fixed to handle ON CONFLICT properly in analytics tables';
COMMENT ON FUNCTION public.safe_upsert_jambase_event IS 'Safe upsert function for jambase_events that avoids ON CONFLICT issues';
COMMENT ON CONSTRAINT jambase_events_jambase_event_id_key ON public.jambase_events IS 'Unique constraint for jambase_event_id to prevent duplicates';
