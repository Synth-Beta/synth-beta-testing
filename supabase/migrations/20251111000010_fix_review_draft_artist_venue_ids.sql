BEGIN;

-- Ensure review drafts never attempt to insert text values into artist_id / venue_id
-- by normalizing any candidate IDs to UUIDs (or leaving them NULL).

CREATE OR REPLACE FUNCTION public.auto_populate_review_artist_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_event_artist_uuid UUID;
  v_event_artist_text TEXT;
  v_lookup_artist_uuid UUID;
  v_candidate TEXT;
  v_selected_artist JSONB;
BEGIN
  IF NEW.artist_id IS NULL THEN
    -- Try to use draft_data.selectedArtist.id when provided
    IF NEW.draft_data IS NOT NULL AND NEW.draft_data ? 'selectedArtist' THEN
      v_selected_artist := NEW.draft_data->'selectedArtist';
      v_candidate := v_selected_artist->>'id';
      IF v_candidate IS NOT NULL THEN
        BEGIN
          NEW.artist_id := v_candidate::uuid;
        EXCEPTION WHEN others THEN
          NEW.artist_id := NULL;
        END;
      END IF;
    END IF;

    IF NEW.artist_id IS NULL THEN
      SELECT je.artist_uuid, je.artist_id
      INTO v_event_artist_uuid, v_event_artist_text
      FROM public.jambase_events je
      WHERE je.id = NEW.event_id;

      IF v_event_artist_uuid IS NOT NULL THEN
        NEW.artist_id := v_event_artist_uuid;
      ELSIF v_event_artist_text IS NOT NULL THEN
        BEGIN
          NEW.artist_id := v_event_artist_text::uuid;
        EXCEPTION WHEN others THEN
          -- Fall back to lookup by JamBase ID
          SELECT a.id
          INTO v_lookup_artist_uuid
          FROM public.artists a
          WHERE a.jambase_artist_id = v_event_artist_text
          LIMIT 1;

          NEW.artist_id := v_lookup_artist_uuid;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_populate_review_venue_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_event_venue_uuid UUID;
  v_event_venue_text TEXT;
  v_lookup_venue_uuid UUID;
  v_candidate TEXT;
  v_selected_venue JSONB;
BEGIN
  IF NEW.venue_id IS NULL THEN
    -- Try to use draft_data.selectedVenue.id when provided
    IF NEW.draft_data IS NOT NULL AND NEW.draft_data ? 'selectedVenue' THEN
      v_selected_venue := NEW.draft_data->'selectedVenue';
      v_candidate := v_selected_venue->>'id';
      IF v_candidate IS NOT NULL THEN
        BEGIN
          NEW.venue_id := v_candidate::uuid;
        EXCEPTION WHEN others THEN
          NEW.venue_id := NULL;
        END;
      END IF;
    END IF;

    IF NEW.venue_id IS NULL THEN
      SELECT je.venue_uuid, je.venue_id
      INTO v_event_venue_uuid, v_event_venue_text
      FROM public.jambase_events je
      WHERE je.id = NEW.event_id;

      IF v_event_venue_uuid IS NOT NULL THEN
        NEW.venue_id := v_event_venue_uuid;
      ELSIF v_event_venue_text IS NOT NULL THEN
        BEGIN
          NEW.venue_id := v_event_venue_text::uuid;
        EXCEPTION WHEN others THEN
          -- Fall back to lookup by JamBase ID
          SELECT v.id
          INTO v_lookup_venue_uuid
          FROM public.venues v
          WHERE v.jambase_venue_id = v_event_venue_text
          LIMIT 1;

          NEW.venue_id := v_lookup_venue_uuid;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;

