-- STEP 1 of 2: DDL ONLY. Run this whole file by itself. 2026-09-27.
--
-- WHY THIS FILE EXISTS. The Supabase SQL editor runs a selection as ONE
-- transaction. Files 18 and 19 each ended with the backfill, so when the
-- backfill raised, the rollback also undid the DROP TRIGGER and the function
-- replacements at the top of those files -- which is why the same
-- "record new has no field is_draft" error came back after 18 appeared to work.
--
-- So: all schema changes here, nothing that can fail. Run 21_run_backfill.sql
-- afterwards, separately.
--
-- Everything below is idempotent and safe to re-run.

-- 1. The passport_entries scene trigger. auto_update_scene_progress() reads
--    NEW.is_draft / NEW.event_id / NEW.artist_id -- all `reviews` columns -- so
--    on passport_entries it raises 42703 and blocks every stamp insert. It is
--    also redundant: the review that creates a stamp already fires
--    trigger_auto_update_scene_progress_review for the same artist/venue.
DROP TRIGGER IF EXISTS trigger_auto_update_scene_progress_passport
  ON public.passport_entries;

-- 2. Guard the function so re-attaching it anywhere fails safe rather than
--    blocking that table's writes. Body otherwise byte-identical.
CREATE OR REPLACE FUNCTION public.auto_update_scene_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_scene_ids UUID[];
  v_artist_venue_ids RECORD;
BEGIN
  IF TG_TABLE_NAME <> 'reviews' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
    FROM public.scene_participants sp
    WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
    AND (
      (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND (
        (OLD.event_id IS NOT NULL AND sp.artist_id IN (SELECT e.artist_id FROM public.events e WHERE e.id = OLD.event_id))
        OR (OLD.event_id IS NULL AND sp.artist_id = COALESCE(OLD.artist_id, OLD.user_created_artist_id))
      )) OR
      (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND (
        (OLD.event_id IS NOT NULL AND sp.venue_id IN (SELECT e.venue_id FROM public.events e WHERE e.id = OLD.event_id))
        OR (OLD.event_id IS NULL AND sp.venue_id = OLD.venue_id)
      ))
    );
  ELSIF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_draft = false THEN
    IF NEW.event_id IS NOT NULL THEN
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      JOIN public.events e ON e.id = NEW.event_id
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = e.artist_id) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = e.venue_id) OR
        (sp.participant_type = 'city' AND e.venue_city = sp.text_value) OR
        (sp.participant_type = 'genre' AND e.genres IS NOT NULL AND e.genres @> ARRAY[sp.text_value])
      );
    ELSE
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = COALESCE(NEW.artist_id, NEW.user_created_artist_id)) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = NEW.venue_id)
      );
    END IF;
  END IF;

  IF v_scene_ids IS NOT NULL AND array_length(v_scene_ids, 1) > 0 THEN
    PERFORM public.calculate_scene_progress(v_user_id, unnest_scene_id)
    FROM UNNEST(v_scene_ids) AS unnest_scene_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. unlock_passport_city: ON CONFLICT (user_id, type, entity_id) referenced a
--    unique constraint that does not exist, so this raised 42P10 on every call
--    and no 'city' stamp has ever been written. Now check-then-insert, matching
--    what unlock_passport_artist / unlock_passport_venue already do.
--    ponytail: check-then-insert can race; worst case is a duplicate stamp, the
--    same trade the artist/venue functions already make.
CREATE OR REPLACE FUNCTION public.unlock_passport_city(
  p_user_id uuid, p_city_name text, p_state text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_entry_id UUID;
  v_entity_id TEXT;
BEGIN
  IF p_city_name IS NULL OR trim(p_city_name) = '' THEN
    RETURN NULL;
  END IF;

  v_entity_id := LOWER(COALESCE(p_city_name, '') || COALESCE('_' || p_state, ''));

  SELECT id INTO v_entry_id
  FROM public.passport_entries
  WHERE user_id = p_user_id AND type = 'city' AND entity_id = v_entity_id;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
    VALUES (p_user_id, 'city', v_entity_id,
            COALESCE(p_city_name, 'Unknown City'),
            jsonb_build_object('state', p_state))
    RETURNING id INTO v_entry_id;
  END IF;

  RETURN v_entry_id;
END;
$function$;

-- 4. Same defect, same fix, for scenes.
CREATE OR REPLACE FUNCTION public.unlock_passport_scene(
  p_user_id uuid, p_scene_id text, p_scene_name text,
  p_scene_description text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_entry_id UUID;
BEGIN
  IF p_scene_id IS NULL OR trim(p_scene_id) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_entry_id
  FROM public.passport_entries
  WHERE user_id = p_user_id AND type = 'scene' AND entity_id = p_scene_id;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
    VALUES (p_user_id, 'scene', p_scene_id, p_scene_name,
            jsonb_build_object('description', p_scene_description))
    RETURNING id INTO v_entry_id;
  END IF;

  RETURN v_entry_id;
END;
$function$;


-- CONFIRM THE DDL STUCK ----------------------------------------------------
-- All three must be true before running 21. If any is false the transaction
-- rolled back again and nothing below it applied.
SELECT
  NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname = 'passport_entries'
      AND t.tgname = 'trigger_auto_update_scene_progress_passport'
  ) AS scene_trigger_dropped,
  (SELECT p.prosrc ILIKE '%TG_TABLE_NAME%' FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'auto_update_scene_progress'
  ) AS scene_function_guarded,
  (SELECT p.prosrc NOT ILIKE '%ON CONFLICT%' FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'unlock_passport_city'
  ) AS city_function_fixed;
