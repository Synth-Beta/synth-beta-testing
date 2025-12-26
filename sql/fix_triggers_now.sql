-- ============================================
-- IMMEDIATE FIX: Update Triggers to Match Schema
-- Run this SQL directly in Supabase SQL Editor
-- ============================================

-- Fix update_event_media_from_artist function (this is the one causing the error)
CREATE OR REPLACE FUNCTION public.update_event_media_from_artist()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When artist_id is set or changed, update event_media_url from artist's image_url
  IF NEW.artist_id IS NOT NULL THEN
    SELECT image_url INTO NEW.event_media_url
    FROM public.artists
    WHERE id = NEW.artist_id;
  ELSE
    NEW.event_media_url := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix update_events_when_artist_image_changes function
CREATE OR REPLACE FUNCTION public.update_events_when_artist_image_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When artist's image_url changes, update all events that reference this artist
  UPDATE public.events
  SET event_media_url = NEW.image_url
  WHERE events.artist_id = NEW.id
    AND (events.event_media_url IS NULL OR events.event_media_url = OLD.image_url);

  RETURN NEW;
END;
$$;

-- The update_artist_upcoming_events_count and update_venue_upcoming_events_count
-- should already be using artist_id/venue_id correctly based on recent migrations
-- but let's make sure they're correct:

CREATE OR REPLACE FUNCTION public.update_artist_upcoming_events_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.artist_id IS NOT NULL THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.artist_id = NEW.artist_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE artists.id = NEW.artist_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.artist_id IS NOT NULL THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.artist_id = OLD.artist_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE artists.id = OLD.artist_id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.artist_id IS DISTINCT FROM NEW.artist_id THEN
      IF OLD.artist_id IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events
          WHERE events.artist_id = OLD.artist_id
            AND events.event_date >= NOW()
            AND events.event_status IS DISTINCT FROM 'EventCancelled'
        )
        WHERE artists.id = OLD.artist_id;
      END IF;
      
      IF NEW.artist_id IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events
          WHERE events.artist_id = NEW.artist_id
            AND events.event_date >= NOW()
            AND events.event_status IS DISTINCT FROM 'EventCancelled'
        )
        WHERE artists.id = NEW.artist_id;
      END IF;
    ELSIF NEW.artist_id IS NOT NULL THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.artist_id = NEW.artist_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE artists.id = NEW.artist_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_venue_upcoming_events_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.venue_id IS NOT NULL THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.venue_id = NEW.venue_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE venues.id = NEW.venue_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.venue_id IS NOT NULL THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.venue_id = OLD.venue_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE venues.id = OLD.venue_id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.venue_id IS DISTINCT FROM NEW.venue_id THEN
      IF OLD.venue_id IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events
          WHERE events.venue_id = OLD.venue_id
            AND events.event_date >= NOW()
            AND events.event_status IS DISTINCT FROM 'EventCancelled'
        )
        WHERE venues.id = OLD.venue_id;
      END IF;
      
      IF NEW.venue_id IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events
          WHERE events.venue_id = NEW.venue_id
            AND events.event_date >= NOW()
            AND events.event_status IS DISTINCT FROM 'EventCancelled'
        )
        WHERE venues.id = NEW.venue_id;
      END IF;
    ELSIF NEW.venue_id IS NOT NULL THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events
        WHERE events.venue_id = NEW.venue_id
          AND events.event_date >= NOW()
          AND events.event_status IS DISTINCT FROM 'EventCancelled'
      )
      WHERE venues.id = NEW.venue_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- Verify the trigger is using the correct column
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'events'
  AND trigger_name LIKE '%artist%' OR trigger_name LIKE '%venue%'
ORDER BY trigger_name;

