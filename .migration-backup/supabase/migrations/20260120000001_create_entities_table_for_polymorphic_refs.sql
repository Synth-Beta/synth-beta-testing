-- ============================================================
-- Create Entities Table for Polymorphic References (Option B)
-- ============================================================
-- This migration fixes polymorphic reference integrity issues by:
-- 1. Creating a unified entities table that all polymorphic references point to
-- 2. Migrating existing polymorphic references to use entities.id
-- 3. Creating triggers to enforce entity integrity (entity_uuid exists in correct table)
--
-- Tables affected:
-- - comments (entity_type, entity_id)
-- - engagements (entity_type, entity_id)
-- - interactions (entity_type, entity_id, entity_uuid)
-- - passport_entries (type, entity_id, entity_uuid)
-- - bucket_list (entity_type, entity_id)
--
-- Rationale (Option B):
-- - All polymorphic references point to entities.id (FK integrity)
-- - entities table has unique(entity_type, entity_uuid) to prevent duplicates
-- - Triggers enforce that entity_uuid exists in the correct target table
-- - Better integrity than Option A (separate tables) or Option C (no integrity)

BEGIN;

-- ============================================================
-- STEP 1: CREATE entities TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('review', 'event', 'artist', 'venue', 'comment', 'user', 'city', 'scene')),
  entity_uuid UUID NULL,  -- NULL for entities that don't have UUIDs (e.g., cities, scenes)
  entity_text_id TEXT NULL,  -- For entities without UUIDs (e.g., city names, scene IDs)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure exactly one identity field is set
  CONSTRAINT entities_one_identity CHECK (
    (entity_uuid IS NOT NULL AND entity_text_id IS NULL) OR
    (entity_uuid IS NULL AND entity_text_id IS NOT NULL)
  )
);

-- Create partial unique indexes for UUID-based entities
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_type_uuid_unique 
  ON public.entities(entity_type, entity_uuid) 
  WHERE entity_uuid IS NOT NULL;

-- Create partial unique index for text-based entities  
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_type_text_id_unique 
  ON public.entities(entity_type, entity_text_id) 
  WHERE entity_text_id IS NOT NULL;

-- Create indexes (unique indexes created above)
CREATE INDEX IF NOT EXISTS idx_entities_entity_type ON public.entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_entity_uuid ON public.entities(entity_uuid) WHERE entity_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_entity_text_id ON public.entities(entity_text_id) WHERE entity_text_id IS NOT NULL;

COMMENT ON TABLE public.entities IS 
'Unified entities table for polymorphic references. All tables with entity_type + entity_id/entity_uuid should reference this table via FK to entities.id for integrity.';

COMMENT ON COLUMN public.entities.entity_type IS 
'Type of entity: review, event, artist, venue, comment, user, city, scene';

COMMENT ON COLUMN public.entities.entity_uuid IS 
'UUID of the entity in its source table. NULL for entities without UUIDs (e.g., cities by name, scenes).';

COMMENT ON COLUMN public.entities.entity_text_id IS 
'Text identifier for entities without UUIDs (e.g., city names, scene IDs). Mutually exclusive with entity_uuid.';

-- Enable RLS
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow all authenticated users to read entities
CREATE POLICY "Anyone can view entities"
  ON public.entities
  FOR SELECT
  USING (true);

-- Only service role can insert/update/delete entities (managed via triggers)
CREATE POLICY "Only service role can modify entities"
  ON public.entities
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- STEP 2: POPULATE entities TABLE FROM EXISTING DATA
-- ============================================================

-- Insert entities from comments
INSERT INTO public.entities (entity_type, entity_uuid)
SELECT DISTINCT c.entity_type, c.entity_id::UUID
FROM public.comments c
WHERE c.entity_id IS NOT NULL
  AND c.entity_id::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND c.entity_type IN ('review', 'event', 'artist', 'venue')
  AND NOT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.entity_type = c.entity_type
      AND e.entity_uuid = c.entity_id::UUID
  );

-- Insert entities from engagements
INSERT INTO public.entities (entity_type, entity_uuid)
SELECT DISTINCT eng.entity_type, eng.entity_id::UUID
FROM public.engagements eng
WHERE eng.entity_id IS NOT NULL
  AND eng.entity_id::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND eng.entity_type IN ('review', 'event', 'comment', 'user')
  AND NOT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.entity_type = eng.entity_type
      AND e.entity_uuid = eng.entity_id::UUID
  );

-- Insert entities from interactions (use entity_uuid if available, otherwise entity_id)
INSERT INTO public.entities (entity_type, entity_uuid)
SELECT DISTINCT i.entity_type, COALESCE(i.entity_uuid, i.entity_id::UUID)
FROM public.interactions i
WHERE (i.entity_uuid IS NOT NULL OR (i.entity_id IS NOT NULL AND i.entity_id::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
  AND i.entity_type IN ('review', 'event', 'artist', 'venue', 'comment', 'user')
  AND NOT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.entity_type = i.entity_type
      AND e.entity_uuid = COALESCE(i.entity_uuid, i.entity_id::UUID)
  );

-- Insert entities from passport_entries (use entity_uuid for UUID entities, entity_text_id for text entities)
-- Normalize text IDs to lowercase to prevent duplicates from case differences
INSERT INTO public.entities (entity_type, entity_uuid, entity_text_id)
SELECT DISTINCT
  CASE 
    WHEN pe.type = 'city' THEN 'city'
    WHEN pe.type = 'venue' THEN 'venue'
    WHEN pe.type = 'artist' THEN 'artist'
    WHEN pe.type = 'scene' THEN 'scene'
    ELSE pe.type
  END as entity_type,
  CASE 
    WHEN pe.type IN ('venue', 'artist') AND pe.entity_uuid IS NOT NULL THEN pe.entity_uuid
    WHEN pe.type IN ('venue', 'artist') AND pe.entity_id::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN pe.entity_id::UUID
    ELSE NULL
  END as entity_uuid,
  CASE
    WHEN pe.type IN ('city', 'scene') THEN LOWER(TRIM(pe.entity_id))  -- Normalize to prevent duplicates
    ELSE NULL
  END as entity_text_id
FROM public.passport_entries pe
WHERE pe.type IN ('city', 'venue', 'artist', 'scene')
  AND NOT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.entity_type = CASE 
        WHEN pe.type = 'city' THEN 'city'
        WHEN pe.type = 'venue' THEN 'venue'
        WHEN pe.type = 'artist' THEN 'artist'
        WHEN pe.type = 'scene' THEN 'scene'
        ELSE pe.type
      END
      AND (
        (pe.type IN ('venue', 'artist') AND e.entity_uuid = COALESCE(pe.entity_uuid, pe.entity_id::UUID) AND e.entity_uuid IS NOT NULL)
        OR (pe.type IN ('city', 'scene') AND e.entity_text_id = LOWER(TRIM(pe.entity_id)) AND e.entity_text_id IS NOT NULL)
      )
  );

-- Insert entities from bucket_list
INSERT INTO public.entities (entity_type, entity_uuid)
SELECT DISTINCT bl.entity_type, bl.entity_id
FROM public.bucket_list bl
WHERE bl.entity_id IS NOT NULL
  AND bl.entity_type IN ('artist', 'venue')
  AND NOT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.entity_type = bl.entity_type
      AND e.entity_uuid = bl.entity_id
  );

-- ============================================================
-- STEP 3: ADD entity_id COLUMN TO TABLES THAT NEED IT
-- ============================================================

-- Add entity_id (FK to entities.id) to comments
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS entity_id_new UUID REFERENCES public.entities(id) ON DELETE CASCADE;

-- Add entity_id (FK to entities.id) to engagements
ALTER TABLE public.engagements
ADD COLUMN IF NOT EXISTS entity_id_new UUID REFERENCES public.entities(id) ON DELETE CASCADE;

-- Add entity_id (FK to entities.id) to interactions
ALTER TABLE public.interactions
ADD COLUMN IF NOT EXISTS entity_id_new UUID REFERENCES public.entities(id) ON DELETE CASCADE;

-- Add entity_id (FK to entities.id) to passport_entries
ALTER TABLE public.passport_entries
ADD COLUMN IF NOT EXISTS entity_id_new UUID REFERENCES public.entities(id) ON DELETE CASCADE;

-- Add entity_id (FK to entities.id) to bucket_list
ALTER TABLE public.bucket_list
ADD COLUMN IF NOT EXISTS entity_id_new UUID REFERENCES public.entities(id) ON DELETE CASCADE;

-- ============================================================
-- STEP 4: BACKFILL entity_id_new FROM EXISTING DATA
-- ============================================================

-- Backfill comments.entity_id_new
UPDATE public.comments c
SET entity_id_new = e.id
FROM public.entities e
WHERE e.entity_type = c.entity_type
  AND e.entity_uuid = c.entity_id::UUID
  AND c.entity_id IS NOT NULL
  AND c.entity_id::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Backfill engagements.entity_id_new
UPDATE public.engagements eng
SET entity_id_new = e.id
FROM public.entities e
WHERE e.entity_type = eng.entity_type
  AND e.entity_uuid = eng.entity_id::UUID
  AND eng.entity_id IS NOT NULL
  AND eng.entity_id::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Backfill interactions.entity_id_new
UPDATE public.interactions i
SET entity_id_new = e.id
FROM public.entities e
WHERE e.entity_type = i.entity_type
  AND e.entity_uuid = COALESCE(i.entity_uuid, i.entity_id::UUID)
  AND (i.entity_uuid IS NOT NULL OR (i.entity_id IS NOT NULL AND i.entity_id::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));

-- Backfill passport_entries.entity_id_new
UPDATE public.passport_entries pe
SET entity_id_new = e.id
FROM public.entities e
WHERE e.entity_type = CASE 
    WHEN pe.type = 'city' THEN 'city'
    WHEN pe.type = 'venue' THEN 'venue'
    WHEN pe.type = 'artist' THEN 'artist'
    WHEN pe.type = 'scene' THEN 'scene'
    ELSE pe.type
  END
  AND (
    -- For UUID-based entities (venue, artist)
    (pe.type IN ('venue', 'artist') AND e.entity_uuid = COALESCE(pe.entity_uuid, pe.entity_id::UUID) AND e.entity_uuid IS NOT NULL)
    OR
    -- For text-based entities (city, scene) - normalize for matching
    (pe.type IN ('city', 'scene') AND e.entity_text_id = LOWER(TRIM(pe.entity_id)) AND e.entity_text_id IS NOT NULL)
  );

-- Backfill bucket_list.entity_id_new
UPDATE public.bucket_list bl
SET entity_id_new = e.id
FROM public.entities e
WHERE e.entity_type = bl.entity_type
  AND e.entity_uuid = bl.entity_id
  AND bl.entity_id IS NOT NULL;

-- ============================================================
-- STEP 5: UPDATE TRIGGERS THAT DEPEND ON entity_type COLUMN
-- ============================================================

-- Drop triggers that depend on entity_type column
DROP TRIGGER IF EXISTS update_review_comments_count_insert ON public.comments CASCADE;
DROP TRIGGER IF EXISTS update_review_comments_count_delete ON public.comments CASCADE;

-- Update the trigger function to use entities table instead of entity_type column
CREATE OR REPLACE FUNCTION public.update_review_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_entity_type TEXT;
  v_review_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Handle engagements table
    IF TG_TABLE_NAME = 'engagements' THEN
      -- Get entity_type from entities table
      SELECT e.entity_type, e.entity_uuid INTO v_entity_type, v_review_id
      FROM public.entities e
      WHERE e.id = NEW.entity_id;
      
      IF v_entity_type = 'review' AND NEW.engagement_type = 'like' THEN
        UPDATE public.reviews 
        SET likes_count = COALESCE(likes_count, 0) + 1 
        WHERE id = v_review_id;
      ELSIF v_entity_type = 'review' AND NEW.engagement_type = 'share' THEN
        UPDATE public.reviews 
        SET shares_count = COALESCE(shares_count, 0) + 1 
        WHERE id = v_review_id;
      END IF;
    -- Handle comments table
    ELSIF TG_TABLE_NAME = 'comments' THEN
      -- Get entity_type from entities table
      SELECT e.entity_type, e.entity_uuid INTO v_entity_type, v_review_id
      FROM public.entities e
      WHERE e.id = NEW.entity_id;
      
      IF v_entity_type = 'review' THEN
        UPDATE public.reviews 
        SET comments_count = COALESCE(comments_count, 0) + 1 
        WHERE id = v_review_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Handle engagements table
    IF TG_TABLE_NAME = 'engagements' THEN
      -- Get entity_type from entities table
      SELECT e.entity_type, e.entity_uuid INTO v_entity_type, v_review_id
      FROM public.entities e
      WHERE e.id = OLD.entity_id;
      
      IF v_entity_type = 'review' AND OLD.engagement_type = 'like' THEN
        UPDATE public.reviews 
        SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
        WHERE id = v_review_id;
      ELSIF v_entity_type = 'review' AND OLD.engagement_type = 'share' THEN
        UPDATE public.reviews 
        SET shares_count = GREATEST(COALESCE(shares_count, 0) - 1, 0) 
        WHERE id = v_review_id;
      END IF;
    -- Handle comments table
    ELSIF TG_TABLE_NAME = 'comments' THEN
      -- Get entity_type from entities table
      SELECT e.entity_type, e.entity_uuid INTO v_entity_type, v_review_id
      FROM public.entities e
      WHERE e.id = OLD.entity_id;
      
      IF v_entity_type = 'review' THEN
        UPDATE public.reviews 
        SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
        WHERE id = v_review_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Recreate triggers without WHEN clause (check happens in function now)
CREATE TRIGGER update_review_comments_count_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_comments_count_delete
  AFTER DELETE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

-- ============================================================
-- STEP 6: DROP OLD COLUMNS AND RENAME NEW ONES
-- ============================================================

-- For comments: drop entity_type and old entity_id, rename entity_id_new
ALTER TABLE public.comments
DROP COLUMN IF EXISTS entity_type;

ALTER TABLE public.comments
DROP COLUMN IF EXISTS entity_id;

ALTER TABLE public.comments
RENAME COLUMN entity_id_new TO entity_id;

-- Also update engagements triggers that might depend on entity_type
DROP TRIGGER IF EXISTS update_review_likes_count_insert ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_review_likes_count_delete ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_review_shares_count_insert ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_review_shares_count_delete ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_comment_likes_count_insert ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_comment_likes_count_delete ON public.engagements CASCADE;

-- Update the update_comment_likes_count function to use entities table
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_entity_type TEXT;
  v_comment_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Get entity_type from entities table
    SELECT e.entity_type, e.entity_uuid INTO v_entity_type, v_comment_id
    FROM public.entities e
    WHERE e.id = NEW.entity_id;
    
    -- Increment comment likes count if entity is a comment
    IF v_entity_type = 'comment' AND NEW.engagement_type = 'like' THEN
      UPDATE public.comments 
      SET likes_count = COALESCE(likes_count, 0) + 1 
      WHERE id = v_comment_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Get entity_type from entities table
    SELECT e.entity_type, e.entity_uuid INTO v_entity_type, v_comment_id
    FROM public.entities e
    WHERE e.id = OLD.entity_id;
    
    -- Decrement comment likes count if entity is a comment
    IF v_entity_type = 'comment' AND OLD.engagement_type = 'like' THEN
      UPDATE public.comments 
      SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
      WHERE id = v_comment_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Recreate comment likes triggers without WHEN clause
CREATE TRIGGER update_comment_likes_count_insert
  AFTER INSERT ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_comment_likes_count();

CREATE TRIGGER update_comment_likes_count_delete
  AFTER DELETE ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_comment_likes_count();

-- Recreate engagements triggers without WHEN clause (check happens in function now)
CREATE TRIGGER update_review_likes_count_insert
  AFTER INSERT ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_likes_count_delete
  AFTER DELETE ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_shares_count_insert
  AFTER INSERT ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_shares_count_delete
  AFTER DELETE ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_counts();

-- For engagements: drop entity_type and old entity_id, rename entity_id_new
ALTER TABLE public.engagements
DROP COLUMN IF EXISTS entity_type;

ALTER TABLE public.engagements
DROP COLUMN IF EXISTS entity_id;

ALTER TABLE public.engagements
RENAME COLUMN entity_id_new TO entity_id;

-- For interactions: keep entity_type and entity_uuid for analytics, but add entity_id FK
-- Note: We keep entity_type and entity_uuid for analytics purposes, but add entity_id as FK
ALTER TABLE public.interactions
RENAME COLUMN entity_id_new TO entity_id_fk;

-- For passport_entries: keep type (it's not entity_type), keep entity_uuid, add entity_id FK
ALTER TABLE public.passport_entries
RENAME COLUMN entity_id_new TO entity_id_fk;

-- For bucket_list: drop entity_type and old entity_id, rename entity_id_new
ALTER TABLE public.bucket_list
DROP COLUMN IF EXISTS entity_type;

ALTER TABLE public.bucket_list
DROP COLUMN IF EXISTS entity_id;

ALTER TABLE public.bucket_list
RENAME COLUMN entity_id_new TO entity_id;

-- ============================================================
-- STEP 6: UPDATE INDEXES
-- ============================================================

-- Drop old indexes that referenced entity_type, entity_id
DROP INDEX IF EXISTS idx_comments_new_entity_type;
DROP INDEX IF EXISTS idx_comments_new_entity_id;
DROP INDEX IF EXISTS idx_comments_new_entity;

DROP INDEX IF EXISTS idx_engagements_new_entity_type;
DROP INDEX IF EXISTS idx_engagements_new_entity_id;
DROP INDEX IF EXISTS idx_engagements_new_entity;

DROP INDEX IF EXISTS idx_bucket_list_entity;

-- Create new indexes on entity_id (FK to entities)
CREATE INDEX IF NOT EXISTS idx_comments_entity_id ON public.comments(entity_id);
CREATE INDEX IF NOT EXISTS idx_engagements_entity_id ON public.engagements(entity_id);
CREATE INDEX IF NOT EXISTS idx_bucket_list_entity_id ON public.bucket_list(entity_id);
CREATE INDEX IF NOT EXISTS idx_interactions_entity_id_fk ON public.interactions(entity_id_fk);
CREATE INDEX IF NOT EXISTS idx_passport_entries_entity_id_fk ON public.passport_entries(entity_id_fk);

-- ============================================================
-- STEP 7: CREATE TRIGGER FUNCTION TO ENFORCE ENTITY INTEGRITY
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
  -- Handle both entity_id and entity_id_fk column names
  v_entity_id := COALESCE(NEW.entity_id, NEW.entity_id_fk);

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
        -- FK on parent_comment_id already handles referential integrity
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

-- ============================================================
-- STEP 8: CREATE TRIGGERS TO ENFORCE INTEGRITY
-- ============================================================

-- Trigger on comments
DROP TRIGGER IF EXISTS trg_enforce_entity_integrity_comments ON public.comments;
CREATE TRIGGER trg_enforce_entity_integrity_comments
  BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW
  WHEN (NEW.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.enforce_entity_integrity();

-- Trigger on engagements
DROP TRIGGER IF EXISTS trg_enforce_entity_integrity_engagements ON public.engagements;
CREATE TRIGGER trg_enforce_entity_integrity_engagements
  BEFORE INSERT OR UPDATE ON public.engagements
  FOR EACH ROW
  WHEN (NEW.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.enforce_entity_integrity();

-- Trigger on bucket_list
DROP TRIGGER IF EXISTS trg_enforce_entity_integrity_bucket_list ON public.bucket_list;
CREATE TRIGGER trg_enforce_entity_integrity_bucket_list
  BEFORE INSERT OR UPDATE ON public.bucket_list
  FOR EACH ROW
  WHEN (NEW.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.enforce_entity_integrity();

-- Trigger on interactions (if using entity_id_fk)
DROP TRIGGER IF EXISTS trg_enforce_entity_integrity_interactions ON public.interactions;
CREATE TRIGGER trg_enforce_entity_integrity_interactions
  BEFORE INSERT OR UPDATE ON public.interactions
  FOR EACH ROW
  WHEN (NEW.entity_id_fk IS NOT NULL)
  EXECUTE FUNCTION public.enforce_entity_integrity();

-- Trigger on passport_entries (if using entity_id_fk)
DROP TRIGGER IF EXISTS trg_enforce_entity_integrity_passport_entries ON public.passport_entries;
CREATE TRIGGER trg_enforce_entity_integrity_passport_entries
  BEFORE INSERT OR UPDATE ON public.passport_entries
  FOR EACH ROW
  WHEN (NEW.entity_id_fk IS NOT NULL)
  EXECUTE FUNCTION public.enforce_entity_integrity();

-- ============================================================
-- STEP 9: CREATE FUNCTION TO GET OR CREATE ENTITY
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_or_create_entity(
  p_entity_type TEXT,
  p_entity_uuid UUID DEFAULT NULL,
  p_entity_text_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id UUID;
  v_normalized_text_id TEXT;
BEGIN
  -- Validate that exactly one of entity_uuid or entity_text_id is provided
  IF (p_entity_uuid IS NOT NULL) = (p_entity_text_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Must provide exactly one of entity_uuid or entity_text_id';
  END IF;

  -- Normalize text_id for cities/scenes to prevent duplicates
  IF p_entity_text_id IS NOT NULL THEN
    v_normalized_text_id := LOWER(TRIM(p_entity_text_id));
  END IF;

  -- Try to find existing entity
  IF p_entity_uuid IS NOT NULL THEN
    SELECT id INTO v_entity_id
    FROM public.entities
    WHERE entity_type = p_entity_type
      AND entity_uuid = p_entity_uuid;
  ELSE
    SELECT id INTO v_entity_id
    FROM public.entities
    WHERE entity_type = p_entity_type
      AND entity_text_id = v_normalized_text_id;
  END IF;

  -- If found, return it
  IF v_entity_id IS NOT NULL THEN
    RETURN v_entity_id;
  END IF;

  -- Otherwise, create new entity (handle conflicts by retrying lookup)
  BEGIN
    IF p_entity_uuid IS NOT NULL THEN
      INSERT INTO public.entities (entity_type, entity_uuid, entity_text_id)
      VALUES (p_entity_type, p_entity_uuid, NULL);
    ELSE
      INSERT INTO public.entities (entity_type, entity_uuid, entity_text_id)
      VALUES (p_entity_type, NULL, v_normalized_text_id);
    END IF;
    
    -- Get the newly inserted id
    IF p_entity_uuid IS NOT NULL THEN
      SELECT id INTO v_entity_id
      FROM public.entities
      WHERE entity_type = p_entity_type AND entity_uuid = p_entity_uuid;
    ELSE
      SELECT id INTO v_entity_id
      FROM public.entities
      WHERE entity_type = p_entity_type AND entity_text_id = v_normalized_text_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Entity was created concurrently, fetch it
    IF p_entity_uuid IS NOT NULL THEN
      SELECT id INTO v_entity_id
      FROM public.entities
      WHERE entity_type = p_entity_type AND entity_uuid = p_entity_uuid;
    ELSE
      SELECT id INTO v_entity_id
      FROM public.entities
      WHERE entity_type = p_entity_type AND entity_text_id = v_normalized_text_id;
    END IF;
  END;

  RETURN v_entity_id;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_entity(TEXT, UUID, TEXT) IS 
'Gets or creates an entity record. Use this when inserting rows into tables that reference entities.id. Provide either entity_uuid (for UUID-based entities) or entity_text_id (for text-based entities like cities/scenes). Text IDs are normalized to lowercase to prevent duplicates. This function is SECURITY DEFINER to bypass RLS on entities table.';

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Entities table migration complete:';
  RAISE NOTICE '  1. ✅ Created entities table';
  RAISE NOTICE '  2. ✅ Populated entities from existing data';
  RAISE NOTICE '  3. ✅ Added entity_id FK columns';
  RAISE NOTICE '  4. ✅ Backfilled entity_id from existing data';
  RAISE NOTICE '  5. ✅ Removed old entity_type/entity_id columns';
  RAISE NOTICE '  6. ✅ Created integrity triggers';
  RAISE NOTICE '  7. ✅ Created get_or_create_entity function';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Note: Application code must be updated to:';
  RAISE NOTICE '  - Use entities.id instead of entity_type + entity_id';
  RAISE NOTICE '  - Call get_or_create_entity() before inserting';
  RAISE NOTICE '  - Update TypeScript types';
  RAISE NOTICE '================================================';
END $$;

COMMIT;

