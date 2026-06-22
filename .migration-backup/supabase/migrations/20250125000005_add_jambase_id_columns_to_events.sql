-- ============================================
-- Add Jambase ID columns to events table
-- ============================================
-- This migration adds columns to store the actual Jambase ID values
-- (not UUIDs) for artists and venues in the events table.
-- 
-- The existing artist_jambase_id and venue_jambase_id columns store
-- UUIDs that reference the artists and venues tables. These new columns
-- store the actual Jambase ID strings (e.g., "3953048") for easier
-- querying and reference.

-- Step 1: Add new columns
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS artist_jambase_id_text TEXT,
ADD COLUMN IF NOT EXISTS venue_jambase_id_text TEXT;

-- Step 2: Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_events_artist_jambase_id_text 
ON public.events(artist_jambase_id_text);

CREATE INDEX IF NOT EXISTS idx_events_venue_jambase_id_text 
ON public.events(venue_jambase_id_text);

-- Step 3: Populate the new columns from the artists and venues tables
-- Update artist_jambase_id_text by joining with artists table
UPDATE public.events e
SET artist_jambase_id_text = a.jambase_artist_id
FROM public.artists a
WHERE e.artist_jambase_id = a.id
  AND e.artist_jambase_id IS NOT NULL
  AND a.jambase_artist_id IS NOT NULL;

-- Update venue_jambase_id_text by joining with venues table
UPDATE public.events e
SET venue_jambase_id_text = v.jambase_venue_id
FROM public.venues v
WHERE e.venue_jambase_id = v.id
  AND e.venue_jambase_id IS NOT NULL
  AND v.jambase_venue_id IS NOT NULL;

-- Step 4: Add comments for documentation
COMMENT ON COLUMN public.events.artist_jambase_id_text IS 
'Actual Jambase artist ID (TEXT, e.g., "3953048"). This is the jambase_artist_id value from the artists table, not the UUID foreign key.';

COMMENT ON COLUMN public.events.venue_jambase_id_text IS 
'Actual Jambase venue ID (TEXT, e.g., "12345"). This is the jambase_venue_id value from the venues table, not the UUID foreign key.';

-- Step 5: Create a trigger to automatically update these columns when
-- artist_jambase_id or venue_jambase_id foreign keys are updated
CREATE OR REPLACE FUNCTION public.update_event_jambase_id_texts()
RETURNS TRIGGER AS $$
BEGIN
  -- Update artist_jambase_id_text if artist_jambase_id changed
  IF NEW.artist_jambase_id IS DISTINCT FROM OLD.artist_jambase_id THEN
    IF NEW.artist_jambase_id IS NOT NULL THEN
      SELECT jambase_artist_id INTO NEW.artist_jambase_id_text
      FROM public.artists
      WHERE id = NEW.artist_jambase_id;
    ELSE
      NEW.artist_jambase_id_text := NULL;
    END IF;
  END IF;

  -- Update venue_jambase_id_text if venue_jambase_id changed
  IF NEW.venue_jambase_id IS DISTINCT FROM OLD.venue_jambase_id THEN
    IF NEW.venue_jambase_id IS NOT NULL THEN
      SELECT jambase_venue_id INTO NEW.venue_jambase_id_text
      FROM public.venues
      WHERE id = NEW.venue_jambase_id;
    ELSE
      NEW.venue_jambase_id_text := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_event_jambase_id_texts ON public.events;
CREATE TRIGGER trigger_update_event_jambase_id_texts
BEFORE INSERT OR UPDATE OF artist_jambase_id, venue_jambase_id
ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_event_jambase_id_texts();

-- Note: The trigger will automatically maintain these columns going forward.
-- For existing data, the UPDATE statements above populate the initial values.

