-- =============================================================================
-- DAG TAXONOMY: Seed umbrella roots (human-readable)
-- Idempotent: inserts only genres that exist and are not already roots.
-- =============================================================================

INSERT INTO genre_taxonomy_roots (genre_id)
SELECT g.id
FROM genres g
WHERE g.normalized_key IN (
  'rock',
  'pop',
  'electronic',
  'hip hop',
  'r&b',
  'r and b',
  'country',
  'folk',
  'jazz',
  'classical',
  'metal',
  'punk',
  'blues',
  'reggae',
  'indie',
  'soul',
  'dance',
  'latin',
  'world',
  'alternative',
  'ambient',
  'experimental'
)
ON CONFLICT (genre_id) DO NOTHING;
