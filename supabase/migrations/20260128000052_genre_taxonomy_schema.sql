-- =============================================================================
-- DAG genre taxonomy: roots, parent, paths, exclude
-- Depends on: 20260128000050 (genres)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.genre_taxonomy_roots (
  genre_id UUID PRIMARY KEY REFERENCES public.genres(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_genre_taxonomy_roots_genre ON public.genre_taxonomy_roots (genre_id);

CREATE TABLE IF NOT EXISTS public.genre_parent (
  child_id UUID NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  confidence double precision NOT NULL DEFAULT 1.0,
  PRIMARY KEY (child_id, parent_id),
  CONSTRAINT genre_parent_no_self CHECK (child_id <> parent_id)
);

CREATE INDEX IF NOT EXISTS idx_genre_parent_child ON public.genre_parent (child_id);
CREATE INDEX IF NOT EXISTS idx_genre_parent_parent ON public.genre_parent (parent_id);

CREATE TABLE IF NOT EXISTS public.genre_paths (
  genre_id UUID NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  path_slug text NOT NULL,
  depth int NOT NULL,
  PRIMARY KEY (genre_id, path_slug)
);

CREATE INDEX IF NOT EXISTS idx_genre_paths_genre ON public.genre_paths (genre_id);
CREATE INDEX IF NOT EXISTS idx_genre_paths_path_slug ON public.genre_paths (path_slug text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_genre_paths_depth ON public.genre_paths (depth);

CREATE TABLE IF NOT EXISTS public.genre_taxonomy_exclude (
  normalized_key text PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_genre_taxonomy_exclude_key ON public.genre_taxonomy_exclude (normalized_key);

CREATE OR REPLACE FUNCTION public.genre_taxonomy_assert_dag(p_child_id uuid, p_parent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_descendant boolean;
BEGIN
  IF p_child_id = p_parent_id THEN
    RAISE EXCEPTION 'genre_taxonomy: child and parent cannot be the same';
  END IF;
  WITH RECURSIVE descendants AS (
    SELECT child_id AS genre_id FROM public.genre_parent WHERE parent_id = p_child_id
    UNION
    SELECT p.child_id FROM public.genre_parent p JOIN descendants d ON d.genre_id = p.parent_id
  )
  SELECT EXISTS (SELECT 1 FROM descendants WHERE genre_id = p_parent_id) INTO v_is_descendant;
  IF v_is_descendant THEN
    RAISE EXCEPTION 'genre_taxonomy: would create cycle (parent is descendant of child)';
  END IF;
  RETURN true;
END;
$$;
