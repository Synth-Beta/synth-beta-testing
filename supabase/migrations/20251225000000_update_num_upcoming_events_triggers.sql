-- ============================================================
-- Update num_upcoming_events triggers for artists and venues
-- ============================================================
-- This migration creates triggers to automatically maintain
-- the num_upcoming_events count in artists and venues tables
-- whenever events are inserted, updated, or deleted.

-- Function to update artist's num_upcoming_events
CREATE OR REPLACE FUNCTION public.update_artist_upcoming_events_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist_uuid UUID;
  v_old_artist_uuid UUID;
BEGIN
  -- Handle INSERT and UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Get artist UUID from artist_jambase_id (UUID column)
    v_artist_uuid := NEW.artist_jambase_id;
    
    -- If artist UUID exists, update the count
    IF v_artist_uuid IS NOT NULL THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.artist_jambase_id = v_artist_uuid
          AND e.event_date >= NOW()
      )
      WHERE id = v_artist_uuid;
    END IF;
    
    -- Also handle artist_jambase_id_text (text column) if UUID is null
    IF v_artist_uuid IS NULL AND NEW.artist_jambase_id_text IS NOT NULL THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.artist_jambase_id_text = NEW.artist_jambase_id_text
          AND e.event_date >= NOW()
      )
      WHERE jambase_artist_id = NEW.artist_jambase_id_text;
    END IF;
  END IF;
  
  -- Handle UPDATE and DELETE (need to update old artist too)
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_artist_uuid := OLD.artist_jambase_id;
    
    -- If artist changed, update old artist's count
    IF TG_OP = 'UPDATE' AND v_old_artist_uuid IS DISTINCT FROM v_artist_uuid THEN
      IF v_old_artist_uuid IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.artist_jambase_id = v_old_artist_uuid
            AND e.event_date >= NOW()
        )
        WHERE id = v_old_artist_uuid;
      END IF;
      
      -- Also update old artist by text ID if UUID was null
      IF v_old_artist_uuid IS NULL AND OLD.artist_jambase_id_text IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.artist_jambase_id_text = OLD.artist_jambase_id_text
            AND e.event_date >= NOW()
        )
        WHERE jambase_artist_id = OLD.artist_jambase_id_text;
      END IF;
    END IF;
    
    -- Handle DELETE - update the artist's count
    IF TG_OP = 'DELETE' THEN
      IF v_old_artist_uuid IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.artist_jambase_id = v_old_artist_uuid
            AND e.event_date >= NOW()
        )
        WHERE id = v_old_artist_uuid;
      END IF;
      
      -- Also handle artist_jambase_id_text if UUID is null
      IF v_old_artist_uuid IS NULL AND OLD.artist_jambase_id_text IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.artist_jambase_id_text = OLD.artist_jambase_id_text
            AND e.event_date >= NOW()
        )
        WHERE jambase_artist_id = OLD.artist_jambase_id_text;
      END IF;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Function to update venue's num_upcoming_events
CREATE OR REPLACE FUNCTION public.update_venue_upcoming_events_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_uuid UUID;
  v_old_venue_uuid UUID;
BEGIN
  -- Handle INSERT and UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Get venue UUID from venue_jambase_id (UUID column)
    v_venue_uuid := NEW.venue_jambase_id;
    
    -- If venue UUID exists, update the count
    IF v_venue_uuid IS NOT NULL THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.venue_jambase_id = v_venue_uuid
          AND e.event_date >= NOW()
      )
      WHERE id = v_venue_uuid;
    END IF;
    
    -- Also handle venue_jambase_id_text (text column) if UUID is null
    IF v_venue_uuid IS NULL AND NEW.venue_jambase_id_text IS NOT NULL THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.venue_jambase_id_text = NEW.venue_jambase_id_text
          AND e.event_date >= NOW()
      )
      WHERE jambase_venue_id = NEW.venue_jambase_id_text;
    END IF;
  END IF;
  
  -- Handle UPDATE and DELETE (need to update old venue too)
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_venue_uuid := OLD.venue_jambase_id;
    
    -- If venue changed, update old venue's count
    IF TG_OP = 'UPDATE' AND v_old_venue_uuid IS DISTINCT FROM v_venue_uuid THEN
      IF v_old_venue_uuid IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.venue_jambase_id = v_old_venue_uuid
            AND e.event_date >= NOW()
        )
        WHERE id = v_old_venue_uuid;
      END IF;
      
      -- Also update old venue by text ID if UUID was null
      IF v_old_venue_uuid IS NULL AND OLD.venue_jambase_id_text IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.venue_jambase_id_text = OLD.venue_jambase_id_text
            AND e.event_date >= NOW()
        )
        WHERE jambase_venue_id = OLD.venue_jambase_id_text;
      END IF;
    END IF;
    
    -- Handle DELETE - update the venue's count
    IF TG_OP = 'DELETE' THEN
      IF v_old_venue_uuid IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.venue_jambase_id = v_old_venue_uuid
            AND e.event_date >= NOW()
        )
        WHERE id = v_old_venue_uuid;
      END IF;
      
      -- Also handle venue_jambase_id_text if UUID is null
      IF v_old_venue_uuid IS NULL AND OLD.venue_jambase_id_text IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.venue_jambase_id_text = OLD.venue_jambase_id_text
            AND e.event_date >= NOW()
        )
        WHERE jambase_venue_id = OLD.venue_jambase_id_text;
      END IF;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_artist_upcoming_events ON public.events;
DROP TRIGGER IF EXISTS trigger_update_venue_upcoming_events ON public.events;

-- Create triggers for artists
CREATE TRIGGER trigger_update_artist_upcoming_events
  AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_artist_upcoming_events_count();

-- Create triggers for venues
CREATE TRIGGER trigger_update_venue_upcoming_events
  AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_venue_upcoming_events_count();

-- Initial population: Update all existing counts using efficient aggregation
-- First, reset all counts to 0
UPDATE public.artists SET num_upcoming_events = 0;
UPDATE public.venues SET num_upcoming_events = 0;

-- Update artists by UUID (using aggregation - much faster)
WITH artist_uuid_counts AS (
  SELECT 
    e.artist_jambase_id AS artist_id,
    COUNT(*) AS event_count
  FROM public.events e
  WHERE e.event_date >= NOW()
    AND e.artist_jambase_id IS NOT NULL
  GROUP BY e.artist_jambase_id
)
UPDATE public.artists a
SET num_upcoming_events = auc.event_count
FROM artist_uuid_counts auc
WHERE a.id = auc.artist_id;

-- Update artists by text ID (using aggregation)
WITH artist_text_counts AS (
  SELECT 
    a.id AS artist_id,
    COUNT(*) AS event_count
  FROM public.events e
  JOIN public.artists a ON e.artist_jambase_id_text = a.jambase_artist_id
  WHERE e.event_date >= NOW()
    AND e.artist_jambase_id_text IS NOT NULL
    AND (e.artist_jambase_id IS NULL OR e.artist_jambase_id != a.id)
  GROUP BY a.id
)
UPDATE public.artists a
SET num_upcoming_events = COALESCE(num_upcoming_events, 0) + atc.event_count
FROM artist_text_counts atc
WHERE a.id = atc.artist_id;

-- Update venues by UUID (using aggregation)
WITH venue_uuid_counts AS (
  SELECT 
    e.venue_jambase_id AS venue_id,
    COUNT(*) AS event_count
  FROM public.events e
  WHERE e.event_date >= NOW()
    AND e.venue_jambase_id IS NOT NULL
  GROUP BY e.venue_jambase_id
)
UPDATE public.venues v
SET num_upcoming_events = vuc.event_count
FROM venue_uuid_counts vuc
WHERE v.id = vuc.venue_id;

-- Update venues by text ID (using aggregation)
WITH venue_text_counts AS (
  SELECT 
    v.id AS venue_id,
    COUNT(*) AS event_count
  FROM public.events e
  JOIN public.venues v ON e.venue_jambase_id_text = v.jambase_venue_id
  WHERE e.event_date >= NOW()
    AND e.venue_jambase_id_text IS NOT NULL
    AND (e.venue_jambase_id IS NULL OR e.venue_jambase_id != v.id)
  GROUP BY v.id
)
UPDATE public.venues v
SET num_upcoming_events = COALESCE(num_upcoming_events, 0) + vtc.event_count
FROM venue_text_counts vtc
WHERE v.id = vtc.venue_id;

-- Add comments
COMMENT ON FUNCTION public.update_artist_upcoming_events_count() IS 'Automatically updates num_upcoming_events count in artists table when events change';
COMMENT ON FUNCTION public.update_venue_upcoming_events_count() IS 'Automatically updates num_upcoming_events count in venues table when events change';
