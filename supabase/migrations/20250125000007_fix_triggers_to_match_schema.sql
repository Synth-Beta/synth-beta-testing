-- ============================================
-- Fix All Triggers to Match Source of Truth Schema
-- ============================================
-- This migration fixes all trigger functions to use the correct column names:
-- - events.artist_id (UUID FK) - NOT artist_jambase_id
-- - events.venue_id (UUID FK) - NOT venue_jambase_id
-- ============================================

-- Fix update_artist_upcoming_events_count function
CREATE OR REPLACE FUNCTION public.update_artist_upcoming_events_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Handle INSERT
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

  -- Handle DELETE
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

  -- Handle UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Update old artist if artist_id changed
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
      
      -- Update new artist
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
      -- Artist didn't change, but event might have been updated (status, date, etc.)
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

-- Fix update_venue_upcoming_events_count function
CREATE OR REPLACE FUNCTION public.update_venue_upcoming_events_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Handle INSERT
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

  -- Handle DELETE
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

  -- Handle UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Update old venue if venue_id changed
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
      
      -- Update new venue
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
      -- Venue didn't change, but event might have been updated (status, date, etc.)
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

-- Fix update_event_media_from_artist function
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

-- Add comments
COMMENT ON FUNCTION public.update_artist_upcoming_events_count() IS 
'Automatically updates num_upcoming_events count in artists table when events change. Uses artist_id column (UUID FK).';

COMMENT ON FUNCTION public.update_venue_upcoming_events_count() IS 
'Automatically updates num_upcoming_events count in venues table when events change. Uses venue_id column (UUID FK).';

COMMENT ON FUNCTION public.update_event_media_from_artist() IS 
'Automatically sets event_media_url from artist image_url when artist_id is set or changed on events. Uses artist_id column (UUID FK).';

COMMENT ON FUNCTION public.update_events_when_artist_image_changes() IS 
'Automatically updates event_media_url for all events when an artist image_url changes. Uses artist_id column (UUID FK).';




