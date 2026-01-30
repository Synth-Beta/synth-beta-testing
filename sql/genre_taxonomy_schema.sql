-- =============================================================================
-- DAG GENRE TAXONOMY
-- Human-defined umbrella roots; parent-child from co-occurrence (broader + PMI);
-- materialized paths for fast "under umbrella" queries.
-- Run after genres_schema.sql and genre_similarity_schema.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Umbrella roots (human-curated)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genre_taxonomy_roots (
  genre_id UUID PRIMARY KEY REFERENCES genres(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_genre_taxonomy_roots_genre ON genre_taxonomy_roots (genre_id);

-- -----------------------------------------------------------------------------
-- 2. Parent-child edges (DAG); multiple parents allowed
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genre_parent (
  child_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  confidence double precision NOT NULL DEFAULT 1.0,
  PRIMARY KEY (child_id, parent_id),
  CONSTRAINT genre_parent_no_self CHECK (child_id <> parent_id)
);

CREATE INDEX IF NOT EXISTS idx_genre_parent_child ON genre_parent (child_id);
CREATE INDEX IF NOT EXISTS idx_genre_parent_parent ON genre_parent (parent_id);

-- -----------------------------------------------------------------------------
-- 3. Materialized paths (root-to-genre); one row per path
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genre_paths (
  genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  path_slug text NOT NULL,
  depth int NOT NULL,
  PRIMARY KEY (genre_id, path_slug)
);

CREATE INDEX IF NOT EXISTS idx_genre_paths_genre ON genre_paths (genre_id);
CREATE INDEX IF NOT EXISTS idx_genre_paths_path_slug ON genre_paths (path_slug text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_genre_paths_depth ON genre_paths (depth);

-- -----------------------------------------------------------------------------
-- 4. Drop list: normalized_key to exclude from taxonomy and cluster view
-- Populated by genre_taxonomy_seed_drop_list.sql (from genres table + path heuristics).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genre_taxonomy_exclude (
  normalized_key text PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_genre_taxonomy_exclude_key ON genre_taxonomy_exclude (normalized_key);

-- -----------------------------------------------------------------------------
-- 5. DAG cycle check: parent must not be a descendant of child
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION genre_taxonomy_assert_dag(p_child_id uuid, p_parent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_descendant boolean;
BEGIN
  IF p_child_id = p_parent_id THEN
    RAISE EXCEPTION 'genre_taxonomy: child and parent cannot be the same';
  END IF;
  -- Check if parent_id is reachable from child_id (would create cycle)
  WITH RECURSIVE descendants AS (
    SELECT child_id AS genre_id FROM genre_parent WHERE parent_id = p_child_id
    UNION
    SELECT p.child_id FROM genre_parent p JOIN descendants d ON d.genre_id = p.parent_id
  )
  SELECT EXISTS (SELECT 1 FROM descendants WHERE genre_id = p_parent_id) INTO v_is_descendant;
  IF v_is_descendant THEN
    RAISE EXCEPTION 'genre_taxonomy: would create cycle (parent is descendant of child)';
  END IF;
  RETURN true;
END;
$$;
