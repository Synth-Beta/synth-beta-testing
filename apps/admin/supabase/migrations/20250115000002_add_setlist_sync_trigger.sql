-- Create trigger to automatically sync setlist data from user_reviews to jambase_events
-- This ensures that when a review with setlist data is created or updated,
-- the corresponding event record is also updated with the setlist information

CREATE OR REPLACE FUNCTION sync_setlist_to_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if setlist data exists and is not null
  IF NEW.setlist IS NOT NULL THEN
    -- Update the corresponding jambase_events record
    UPDATE public.jambase_events 
    SET 
      setlist = NEW.setlist,
      setlist_source = 'user_import',
      setlist_enriched = true,
      setlist_last_updated = NOW(),
      updated_at = NOW(),
      setlist_song_count = CASE 
        WHEN NEW.setlist->>'songCount' IS NOT NULL 
        THEN (NEW.setlist->>'songCount')::INTEGER
        WHEN NEW.setlist->'songs' IS NOT NULL AND jsonb_typeof(NEW.setlist->'songs') = 'array'
        THEN jsonb_array_length(NEW.setlist->'songs')
        ELSE 0
      END,
      setlist_fm_url = NEW.setlist->>'url',
      setlist_fm_id = NEW.setlist->>'setlistFmId'
    WHERE id = NEW.event_id;
    
    -- Log the sync for debugging
    RAISE NOTICE 'Synced setlist data from review % to event %', NEW.id, NEW.event_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT operations
CREATE TRIGGER sync_setlist_on_review_insert
  AFTER INSERT ON public.user_reviews
  FOR EACH ROW
  EXECUTE FUNCTION sync_setlist_to_event();

-- Create trigger for UPDATE operations
CREATE TRIGGER sync_setlist_on_review_update
  AFTER UPDATE ON public.user_reviews
  FOR EACH ROW
  WHEN (OLD.setlist IS DISTINCT FROM NEW.setlist)
  EXECUTE FUNCTION sync_setlist_to_event();

-- Add comment to document the triggers
COMMENT ON FUNCTION sync_setlist_to_event() IS 'Automatically syncs setlist data from user_reviews to jambase_events when reviews are created or updated';
