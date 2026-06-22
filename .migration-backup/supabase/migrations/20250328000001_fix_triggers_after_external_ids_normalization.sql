-- ============================================================
-- Fix triggers after external IDs normalization
-- ============================================================
-- Updates trigger functions to use renamed columns (artist_id, venue_id)
-- and removes references to dropped columns (artist_jambase_id_text, venue_jambase_id_text)
-- ============================================================

BEGIN;

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
    -- Get artist UUID from artist_id (renamed from artist_jambase_id)
    v_artist_uuid := NEW.artist_id;
    
    -- If artist UUID exists, update the count
    IF v_artist_uuid IS NOT NULL THEN
      UPDATE public.artists
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.artist_id = v_artist_uuid
          AND e.event_date >= NOW()
      )
      WHERE id = v_artist_uuid;
    END IF;
  END IF;
  
  -- Handle UPDATE and DELETE (need to update old artist too)
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_artist_uuid := OLD.artist_id;
    
    -- If artist changed, update old artist's count
    IF TG_OP = 'UPDATE' AND v_old_artist_uuid IS DISTINCT FROM v_artist_uuid THEN
      IF v_old_artist_uuid IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.artist_id = v_old_artist_uuid
            AND e.event_date >= NOW()
        )
        WHERE id = v_old_artist_uuid;
      END IF;
    END IF;
    
    -- Handle DELETE - update the artist's count
    IF TG_OP = 'DELETE' THEN
      IF v_old_artist_uuid IS NOT NULL THEN
        UPDATE public.artists
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.artist_id = v_old_artist_uuid
            AND e.event_date >= NOW()
        )
        WHERE id = v_old_artist_uuid;
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
    -- Get venue UUID from venue_id (renamed from venue_jambase_id)
    v_venue_uuid := NEW.venue_id;
    
    -- If venue UUID exists, update the count
    IF v_venue_uuid IS NOT NULL THEN
      UPDATE public.venues
      SET num_upcoming_events = (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.venue_id = v_venue_uuid
          AND e.event_date >= NOW()
      )
      WHERE id = v_venue_uuid;
    END IF;
  END IF;
  
  -- Handle UPDATE and DELETE (need to update old venue too)
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_venue_uuid := OLD.venue_id;
    
    -- If venue changed, update old venue's count
    IF TG_OP = 'UPDATE' AND v_old_venue_uuid IS DISTINCT FROM v_venue_uuid THEN
      IF v_old_venue_uuid IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.venue_id = v_old_venue_uuid
            AND e.event_date >= NOW()
        )
        WHERE id = v_old_venue_uuid;
      END IF;
    END IF;
    
    -- Handle DELETE - update the venue's count
    IF TG_OP = 'DELETE' THEN
      IF v_old_venue_uuid IS NOT NULL THEN
        UPDATE public.venues
        SET num_upcoming_events = (
          SELECT COUNT(*)
          FROM public.events e
          WHERE e.venue_id = v_old_venue_uuid
            AND e.event_date >= NOW()
        )
        WHERE id = v_old_venue_uuid;
      END IF;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Re-initialize counts using the new column names
-- Reset all counts to 0
UPDATE public.artists SET num_upcoming_events = 0;
UPDATE public.venues SET num_upcoming_events = 0;

-- Update artists by UUID (using aggregation - much faster)
WITH artist_uuid_counts AS (
  SELECT 
    e.artist_id,
    COUNT(*) AS event_count
  FROM public.events e
  WHERE e.event_date >= NOW()
    AND e.artist_id IS NOT NULL
  GROUP BY e.artist_id
)
UPDATE public.artists a
SET num_upcoming_events = auc.event_count
FROM artist_uuid_counts auc
WHERE a.id = auc.artist_id;

-- Update venues by UUID (using aggregation)
WITH venue_uuid_counts AS (
  SELECT 
    e.venue_id,
    COUNT(*) AS event_count
  FROM public.events e
  WHERE e.event_date >= NOW()
    AND e.venue_id IS NOT NULL
  GROUP BY e.venue_id
)
UPDATE public.venues v
SET num_upcoming_events = vuc.event_count
FROM venue_uuid_counts vuc
WHERE v.id = vuc.venue_id;

-- Add comments
COMMENT ON FUNCTION public.update_artist_upcoming_events_count() IS 
  'Automatically updates num_upcoming_events count in artists table when events change. Updated for 3NF schema (uses artist_id column).';

COMMENT ON FUNCTION public.update_venue_upcoming_events_count() IS 
  'Automatically updates num_upcoming_events count in venues table when events change. Updated for 3NF schema (uses venue_id column).';

COMMIT;




