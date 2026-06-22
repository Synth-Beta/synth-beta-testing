-- Bootstrap genre_canonical and genre_alias from current artists + events data.
-- Run after genre_normalization_schema.sql.
-- If this times out, run: SET statement_timeout = '300s'; before this script.
-- 1. Collects every distinct normalized genre token (after drop rules).
-- 2. Inserts each as a canonical genre (name = initcap, slug = normalized key).
-- 3. Inserts alias: normalized_key -> that canonical_id.
-- So initially every kept token maps to itself; you can later merge aliases
-- (e.g. add genre_alias rows that point "hiphop" -> canonical "Hip hop").

-- Safe to run multiple times: uses ON CONFLICT so existing rows are skipped.

INSERT INTO genre_canonical (name, slug)
SELECT
  initcap(key) AS name,
  key AS slug
FROM (
  SELECT DISTINCT normalize_genre_token(unnest(genres)) AS key
  FROM (
    SELECT genres FROM artists WHERE genres IS NOT NULL AND array_length(genres, 1) > 0
    UNION ALL
    SELECT genres FROM events  WHERE genres IS NOT NULL AND array_length(genres, 1) > 0
  ) t
) keys
WHERE key <> ''
  AND NOT genre_should_drop(key)
  AND NOT EXISTS (SELECT 1 FROM genre_canonical g WHERE g.slug = keys.key)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO genre_alias (normalized_key, canonical_id)
SELECT
  g.slug AS normalized_key,
  g.id   AS canonical_id
FROM genre_canonical g
WHERE NOT EXISTS (SELECT 1 FROM genre_alias a WHERE a.normalized_key = g.slug)
ON CONFLICT (normalized_key) DO NOTHING;
