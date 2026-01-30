-- =============================================================================
-- DAG TAXONOMY: Seed mid-level genres (50–100 manual child → parent edges)
-- Run after genre_taxonomy_seed_umbrellas.sql, before genre_taxonomy_assign_from_similarity.sql.
-- Long-tail assignment will then attach to roots or these mid-level genres.
-- Add rows to the VALUES list (child_normalized_key, parent_normalized_key) to expand.
-- =============================================================================

INSERT INTO genre_parent (child_id, parent_id, confidence)
SELECT c.id, p.id, 1.0
FROM (VALUES
  -- Rock subtree
  ('psychedelic rock', 'rock'),
  ('acid rock', 'psychedelic rock'),
  ('experimental rock', 'rock'),
  ('indie rock', 'rock'),
  ('alternative rock', 'rock'),
  ('hard rock', 'rock'),
  ('punk rock', 'punk'),
  ('folk rock', 'folk'),
  ('country rock', 'country'),
  -- Electronic / dance
  ('house', 'electronic'),
  ('techno', 'electronic'),
  ('trance', 'electronic'),
  ('drum and bass', 'electronic'),
  ('dubstep', 'electronic'),
  ('ambient', 'electronic'),
  ('idm', 'electronic'),
  -- Hip-hop
  ('rap', 'hip hop'),
  ('trap', 'hip hop'),
  ('boom bap', 'hip hop'),
  -- Other common mid-level (expand to 50–100 as needed)
  ('singer songwriter', 'folk'),
  ('americana', 'country'),
  ('bluegrass', 'country'),
  ('smooth jazz', 'jazz'),
  ('bebop', 'jazz'),
  ('death metal', 'metal'),
  ('thrash metal', 'metal'),
  ('post punk', 'punk'),
  ('ska', 'reggae'),
  ('downtempo', 'electronic'),
  ('synth pop', 'pop')
) AS mid(child_key, parent_key)
JOIN genres c ON c.normalized_key = mid.child_key
JOIN genres p ON p.normalized_key = mid.parent_key
WHERE c.id != p.id
ON CONFLICT (child_id, parent_id) DO UPDATE SET confidence = EXCLUDED.confidence;
