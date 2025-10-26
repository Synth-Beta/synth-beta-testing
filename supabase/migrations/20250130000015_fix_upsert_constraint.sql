-- Fix the upsert constraint issue in JamBaseLocationService
-- The error occurs because the upsert is trying to use a constraint that doesn't exist

-- Step 1: Ensure the jambase_event_id unique constraint exists
DO $$ 
BEGIN
  -- Check if the unique constraint exists on jambase_event_id
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

-- Step 2: Alternative approach - create a function that handles upserts safely
CREATE OR REPLACE FUNCTION public.upsert_jambase_event(event_data JSONB)
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
  WHERE jambase_events.jambase_event_id = upsert_jambase_event.jambase_event_id;
  
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

-- Step 3: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_jambase_event(JSONB) TO authenticated;

-- Step 4: Add helpful comment
COMMENT ON FUNCTION public.upsert_jambase_event IS 'Safely upsert jambase events without ON CONFLICT issues';
