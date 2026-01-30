-- =============================================================================
-- GENRE TAXONOMY: Sample paths (human-readable)
-- Run to view a few sample paths from the DAG taxonomy.
-- =============================================================================

-- One random path (depth 2–4) with full genre name chain
WITH one_path AS (
  SELECT path_slug, depth
  FROM genre_paths
  WHERE depth BETWEEN 2 AND 4
  ORDER BY random()
  LIMIT 1
),
segments AS (
  SELECT op.path_slug, op.depth, ord AS seg_pos, seg AS slug
  FROM one_path op,
       unnest(string_to_array(op.path_slug, '.')) WITH ORDINALITY AS t(seg, ord)
),
with_names AS (
  SELECT s.path_slug, s.depth, s.seg_pos, g.name
  FROM segments s
  JOIN genres g ON g.slug = s.slug
)
SELECT path_slug, depth, string_agg(name, ' → ' ORDER BY seg_pos) AS path_display
FROM with_names
GROUP BY path_slug, depth;
