-- ============================================================
-- FIX enforce_entity_integrity: do not access entity_id_fk on tables that lack it
-- ============================================================
-- The function used COALESCE(NEW.entity_id, NEW.entity_id_fk), which causes
-- "record \"new\" has no field \"entity_id_fk\"" on bucket_list, comments, engagements
-- (those tables have entity_id only). interactions and passport_entries have entity_id_fk.
-- Fix: use TG_TABLE_NAME to read only the column that exists on the current table.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_entity_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity RECORD;
  v_exists BOOLEAN;
  v_entity_id UUID;
BEGIN
  -- Only access the column that exists on this table. interactions and passport_entries
  -- use entity_id_fk; comments, engagements, bucket_list use entity_id.
  IF TG_TABLE_NAME IN ('interactions', 'passport_entries') THEN
    v_entity_id := NEW.entity_id_fk;
  ELSE
    v_entity_id := NEW.entity_id;
  END IF;

  IF v_entity_id IS NULL THEN
    RETURN NEW;  -- No entity reference, skip check
  END IF;

  -- Get entity info
  SELECT entity_type, entity_uuid INTO v_entity
  FROM public.entities
  WHERE id = v_entity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entity with id % does not exist in entities table', v_entity_id;
  END IF;

  -- Check that entity_uuid exists in the correct target table
  IF v_entity.entity_uuid IS NOT NULL THEN
    CASE v_entity.entity_type
      WHEN 'review' THEN
        PERFORM 1 FROM public.reviews WHERE id = v_entity.entity_uuid;
        v_exists := FOUND;
      WHEN 'event' THEN
        PERFORM 1 FROM public.events WHERE id = v_entity.entity_uuid;
        v_exists := FOUND;
      WHEN 'artist' THEN
        PERFORM 1 FROM public.artists WHERE id = v_entity.entity_uuid;
        v_exists := FOUND;
      WHEN 'venue' THEN
        PERFORM 1 FROM public.venues WHERE id = v_entity.entity_uuid;
        v_exists := FOUND;
      WHEN 'comment' THEN
        -- Skip existence check for comments to avoid recursion and self-reference issues
        v_exists := true;
      WHEN 'user' THEN
        PERFORM 1 FROM public.users WHERE user_id = v_entity.entity_uuid;
        v_exists := FOUND;
      ELSE
        v_exists := true;  -- Skip check for city, scene (no UUID)
    END CASE;

    IF NOT v_exists THEN
      RAISE EXCEPTION 'Entity uuid % of type % does not exist in target table', v_entity.entity_uuid, v_entity.entity_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_entity_integrity() IS 
'Enforces that entity_id (or entity_id_fk) references a valid entities.id and that entity_uuid exists in the correct target table. Uses TG_TABLE_NAME to read only the column that exists (entity_id vs entity_id_fk).';
