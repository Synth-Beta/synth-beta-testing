-- IMMEDIATE FIX: Run this in Supabase SQL Editor to fix the trigger
-- This allows events with null artist_id to be inserted without errors

CREATE OR REPLACE FUNCTION notify_artist_followers_new_event()
RETURNS TRIGGER AS $$
DECLARE
  v_artist_id UUID;
  v_artist_name TEXT;
  v_follower RECORD;
BEGIN
  -- CRITICAL FIX: Skip if artist_id is null (Ticketmaster events)
  IF NEW.artist_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get artist information from artists table
  SELECT id, name INTO v_artist_id, v_artist_name
  FROM public.artists
  WHERE jambase_artist_id = NEW.artist_id
  LIMIT 1;
  
  -- Only try artist_profile if it exists (wrap in exception handler)
  IF v_artist_id IS NULL THEN
    BEGIN
      SELECT id, name INTO v_artist_id, v_artist_name
      FROM public.artist_profile
      WHERE jambase_artist_id = NEW.artist_id
      LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      -- artist_profile table doesn't exist - this is OK, just continue
      NULL;
    WHEN OTHERS THEN
      -- Any other error - continue without artist lookup
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

