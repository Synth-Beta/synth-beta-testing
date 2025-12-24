-- ============================================
-- Add event media column from artist image_url
-- ============================================
-- This migration adds a column to store the artist's image URL as the event media.
-- The column will be automatically populated and maintained from the linked artist's image_url.

-- Step 1: Add the event_media_url column
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS event_media_url TEXT;

-- Step 2: Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_events_event_media_url 
ON public.events(event_media_url) 
WHERE event_media_url IS NOT NULL;

-- Step 3: Populate existing events from linked artists
UPDATE public.events e
SET event_media_url = a.image_url
FROM public.artists a
WHERE e.artist_jambase_id = a.id
  AND e.artist_jambase_id IS NOT NULL
  AND a.image_url IS NOT NULL;

-- Step 4: Add comment for documentation
COMMENT ON COLUMN public.events.event_media_url IS 
'Event media URL populated from the linked artist''s image_url. This provides a default image for the event based on the performing artist.';

-- Step 5: Create a trigger function to automatically maintain this column
CREATE OR REPLACE FUNCTION public.update_event_media_from_artist()
RETURNS TRIGGER AS $$
BEGIN
  -- Update event_media_url when artist_jambase_id changes
  IF NEW.artist_jambase_id IS DISTINCT FROM OLD.artist_jambase_id THEN
    IF NEW.artist_jambase_id IS NOT NULL THEN
      SELECT image_url INTO NEW.event_media_url
      FROM public.artists
      WHERE id = NEW.artist_jambase_id;
    ELSE
      NEW.event_media_url := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger to maintain event_media_url when artist_jambase_id changes
DROP TRIGGER IF EXISTS trigger_update_event_media_from_artist ON public.events;
CREATE TRIGGER trigger_update_event_media_from_artist
BEFORE INSERT OR UPDATE OF artist_jambase_id
ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_event_media_from_artist();

-- Step 7: Create a trigger function to update events when artist image_url changes
CREATE OR REPLACE FUNCTION public.update_events_when_artist_image_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all events linked to this artist when the artist's image_url changes
  IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN
    UPDATE public.events
    SET event_media_url = NEW.image_url
    WHERE artist_jambase_id = NEW.id
      AND (event_media_url IS NULL OR event_media_url = OLD.image_url);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger on artists table to update events when image_url changes
DROP TRIGGER IF EXISTS trigger_update_events_on_artist_image_change ON public.artists;
CREATE TRIGGER trigger_update_events_on_artist_image_change
AFTER UPDATE OF image_url
ON public.artists
FOR EACH ROW
WHEN (NEW.image_url IS DISTINCT FROM OLD.image_url)
EXECUTE FUNCTION public.update_events_when_artist_image_changes();

-- Note: 
-- - The trigger on events table maintains event_media_url when artist_jambase_id is set/changed
-- - The trigger on artists table updates all linked events when an artist's image_url is updated
-- - This ensures event_media_url stays in sync with the artist's image_url

