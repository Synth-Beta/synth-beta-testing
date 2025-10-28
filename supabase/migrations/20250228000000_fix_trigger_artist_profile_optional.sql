-- Fix trigger to handle optional artist_profile table gracefully
-- This allows Ticketmaster events to be inserted even if artist_profile doesn't exist

CREATE OR REPLACE FUNCTION notify_artist_followers_new_event()
RETURNS TRIGGER AS $$
DECLARE
  v_artist_id UUID;
  v_artist_name TEXT;
  v_follower RECORD;
  v_table_exists BOOLEAN;
BEGIN
  -- Skip notification if artist_id is null (e.g., Ticketmaster events without linked artists)
  IF NEW.artist_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get artist information from artists table first
  BEGIN
    SELECT id, name INTO v_artist_id, v_artist_name
    FROM public.artists
    WHERE jambase_artist_id = NEW.artist_id
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- If artists table query fails, just continue
    NULL;
  END;
  
  -- If artist not found in artists table, try artist_profile if it exists
  IF v_artist_id IS NULL THEN
    BEGIN
      -- Check if artist_profile table exists dynamically
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'artist_profile'
      ) INTO v_table_exists;
      
      -- Only query artist_profile if the table exists
      IF v_table_exists THEN
        BEGIN
          SELECT id, name INTO v_artist_id, v_artist_name
          FROM public.artist_profile
          WHERE jambase_artist_id = NEW.artist_id
          LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
          -- Table might not be accessible or column might not exist, just continue
          NULL;
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If checking for table existence fails, just continue without artist lookup
      NULL;
    END;
  END IF;
  
  -- If artist found, notify all followers
  IF v_artist_id IS NOT NULL THEN
    FOR v_follower IN 
      SELECT user_id 
      FROM public.artist_follows 
      WHERE artist_id = v_artist_id
    LOOP
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
      ) VALUES (
        v_follower.user_id,
        'artist_new_event',
        v_artist_name || ' has a new event!',
        NEW.title || ' at ' || NEW.venue_name || ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
        jsonb_build_object(
          'artist_id', v_artist_id,
          'artist_name', v_artist_name,
          'event_id', NEW.id,
          'event_title', NEW.title,
          'venue_name', NEW.venue_name,
          'event_date', NEW.event_date
        )
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_notify_followers_new_event ON public.jambase_events;
CREATE TRIGGER trigger_notify_followers_new_event
  AFTER INSERT ON public.jambase_events
  FOR EACH ROW
  EXECUTE FUNCTION notify_artist_followers_new_event();

COMMENT ON FUNCTION notify_artist_followers_new_event IS 'Notifies followers when an artist has a new event added. Handles missing artist_profile table gracefully.';

