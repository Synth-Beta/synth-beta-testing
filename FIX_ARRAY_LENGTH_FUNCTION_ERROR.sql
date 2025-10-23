-- Fix array_length function error in setlist sync trigger
-- The error "function array_length(jsonb, integer) does not exist" suggests
-- we need to use the correct PostgreSQL function for JSONB arrays

-- First, let's fix the sync_setlist_to_event function to use the correct syntax
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
        THEN jsonb_array_length(NEW.setlist->'songs')  -- This should work in PostgreSQL 9.4+
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

-- If jsonb_array_length still doesn't work, let's create an alternative version
CREATE OR REPLACE FUNCTION sync_setlist_to_event_safe()
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
        THEN (SELECT COUNT(*) FROM jsonb_array_elements(NEW.setlist->'songs'))  -- Alternative approach
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

-- Drop the existing triggers
DROP TRIGGER IF EXISTS sync_setlist_on_review_insert ON public.user_reviews;
DROP TRIGGER IF EXISTS sync_setlist_on_review_update ON public.user_reviews;

-- Try the original function first
CREATE TRIGGER sync_setlist_on_review_insert
  AFTER INSERT ON public.user_reviews
  FOR EACH ROW
  EXECUTE FUNCTION sync_setlist_to_event();

CREATE TRIGGER sync_setlist_on_review_update
  AFTER UPDATE ON public.user_reviews
  FOR EACH ROW
  WHEN (OLD.setlist IS DISTINCT FROM NEW.setlist)
  EXECUTE FUNCTION sync_setlist_to_event();

-- If the above triggers still fail, uncomment the following lines to use the safe version:
-- DROP TRIGGER IF EXISTS sync_setlist_on_review_insert ON public.user_reviews;
-- DROP TRIGGER IF EXISTS sync_setlist_on_review_update ON public.user_reviews;
-- CREATE TRIGGER sync_setlist_on_review_insert
--   AFTER INSERT ON public.user_reviews
--   FOR EACH ROW
--   EXECUTE FUNCTION sync_setlist_to_event_safe();
-- CREATE TRIGGER sync_setlist_on_review_update
--   AFTER UPDATE ON public.user_reviews
--   FOR EACH ROW
--   WHEN (OLD.setlist IS DISTINCT FROM NEW.setlist)
--   EXECUTE FUNCTION sync_setlist_to_event_safe();
