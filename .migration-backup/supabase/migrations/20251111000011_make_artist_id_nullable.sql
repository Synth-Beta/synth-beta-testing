BEGIN;

-- Allow non-UUID artist identifiers by dropping FK constraint and casting to TEXT
ALTER TABLE public.user_reviews
  DROP CONSTRAINT IF EXISTS user_reviews_artist_id_fkey;

ALTER TABLE public.user_reviews
  ALTER COLUMN artist_id TYPE TEXT USING artist_id::TEXT,
  ALTER COLUMN artist_id DROP NOT NULL;

-- Update trigger helper to avoid UUID casts while still normalizing when possible
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
  IF NEW.artist_id IS NULL OR NEW.artist_id = '' THEN
    IF NEW.draft_data IS NOT NULL AND NEW.draft_data ? 'selectedArtist' THEN
      v_selected_artist := NEW.draft_data->'selectedArtist';
      v_candidate := v_selected_artist->>'id';
      IF v_candidate IS NOT NULL THEN
        NEW.artist_id := v_candidate;
      END IF;
    END IF;

    IF NEW.artist_id IS NULL OR NEW.artist_id = '' THEN
      SELECT je.artist_uuid, je.artist_id
      INTO v_event_artist_uuid, v_event_artist_text
      FROM public.jambase_events je
      WHERE je.id = NEW.event_id;

      IF v_event_artist_uuid IS NOT NULL THEN
        NEW.artist_id := v_event_artist_uuid::TEXT;
      ELSIF v_event_artist_text IS NOT NULL AND v_event_artist_text <> '' THEN
        BEGIN
          NEW.artist_id := (v_event_artist_text::UUID)::TEXT;
        EXCEPTION WHEN others THEN
          SELECT a.id
          INTO v_lookup_artist_uuid
          FROM public.artists a
          WHERE a.jambase_artist_id = v_event_artist_text
          LIMIT 1;

          IF v_lookup_artist_uuid IS NOT NULL THEN
            NEW.artist_id := v_lookup_artist_uuid::TEXT;
          ELSE
            NEW.artist_id := v_event_artist_text;
          END IF;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
