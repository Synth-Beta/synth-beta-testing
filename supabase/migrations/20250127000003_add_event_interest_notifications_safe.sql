-- Add event interest notifications (SAFE VERSION)
-- This migration adds a trigger to notify friends when someone expresses interest in an event

-- First, let's check what notification types currently exist
-- and handle any existing data properly

-- Step 1: Check current notification types (for debugging)
-- Run this first to see what types exist:
-- SELECT DISTINCT type FROM public.notifications;

-- Step 2: Safely update the constraint by first checking existing data
DO $$
DECLARE
    existing_types TEXT[];
    new_constraint TEXT;
BEGIN
    -- Get all existing notification types
    SELECT ARRAY_AGG(DISTINCT type) INTO existing_types
    FROM public.notifications;
    
    -- Add our new type to the list
    existing_types := array_append(existing_types, 'event_interest');
    
    -- Build the constraint string
    new_constraint := 'CHECK (type IN (''' || array_to_string(existing_types, ''', ''') || '''))';
    
    -- Drop existing constraint
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    
    -- Add new constraint with all types
    EXECUTE 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check ' || new_constraint;
    
    RAISE NOTICE 'Updated notification constraint to include types: %', array_to_string(existing_types, ', ');
END $$;

-- Create function to notify friends when someone expresses interest in an event
CREATE OR REPLACE FUNCTION public.notify_friends_event_interest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  friend_record RECORD;
  event_title TEXT;
  user_name TEXT;
  event_venue TEXT;
  event_date TEXT;
BEGIN
  -- Get event details
  SELECT 
    je.title,
    je.venue_name,
    je.event_date::text
  INTO event_title, event_venue, event_date
  FROM jambase_events je
  WHERE je.id = NEW.jambase_event_id;
  
  -- Get user's name
  SELECT name INTO user_name
  FROM profiles
  WHERE user_id = NEW.user_id;
  
  -- If we couldn't find event or user details, skip notification
  IF event_title IS NULL OR user_name IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Create notification for each friend
  FOR friend_record IN
    SELECT 
      CASE 
        WHEN f.user1_id = NEW.user_id THEN f.user2_id
        ELSE f.user1_id
      END as friend_id
    FROM friends f
    WHERE f.user1_id = NEW.user_id OR f.user2_id = NEW.user_id
  LOOP
    -- Insert notification for this friend
    INSERT INTO public.notifications (
      user_id, 
      type, 
      title, 
      message, 
      data
    ) VALUES (
      friend_record.friend_id,
      'event_interest',
      'Friend Interested in Event!',
      COALESCE(user_name, 'Your friend') || ' is interested in "' || event_title || '" at ' || COALESCE(event_venue, 'a venue') || ' on ' || event_date,
      jsonb_build_object(
        'interested_user_id', NEW.user_id,
        'event_id', NEW.jambase_event_id,
        'event_title', event_title,
        'event_venue', event_venue,
        'event_date', event_date,
        'user_name', user_name
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger to fire when someone expresses interest in an event
CREATE TRIGGER on_event_interest_notify_friends
  AFTER INSERT ON public.user_jambase_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_friends_event_interest();

-- Add comment to document the trigger
COMMENT ON FUNCTION public.notify_friends_event_interest() IS 
'Notifies all friends when a user expresses interest in an event by adding a record to user_jambase_events';

COMMENT ON TRIGGER on_event_interest_notify_friends ON public.user_jambase_events IS 
'Trigger that creates notifications for friends when someone expresses interest in an event';
