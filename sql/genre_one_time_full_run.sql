-- =============================================================================
-- GENRE: ONE-TIME FULL RUN
-- Runs all genre SQL in order: 3NF schema + backfill, similarity graph, DAG taxonomy.
-- Prereqs: artists and events tables exist with genres text[] populated.
-- If any step times out in Supabase, run the individual files from GENRE_SQL_RUN_ORDER.md instead.
-- =============================================================================

-- ############################################################################
-- PHASE 1: 3NF NORMALIZATION (genres + join tables)
-- ############################################################################

-- ----- 1.1 Schema -----
CREATE OR REPLACE FUNCTION normalize_genre_key(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(raw, '')), '[-_\s]+', ' ', 'g'));
$$;

CREATE TABLE IF NOT EXISTS genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_genres_normalized_key ON genres(normalized_key);
CREATE INDEX IF NOT EXISTS idx_genres_slug ON genres(slug);
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres(name);

CREATE TABLE IF NOT EXISTS artists_genres (
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artist_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_artists_genres_artist ON artists_genres(artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_genres_genre ON artists_genres(genre_id);

CREATE TABLE IF NOT EXISTS events_genres (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_events_genres_event ON events_genres(event_id);
CREATE INDEX IF NOT EXISTS idx_events_genres_genre ON events_genres(genre_id);

CREATE OR REPLACE FUNCTION upsert_genre(raw_genre TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized_key TEXT;
  v_genre_id UUID;
BEGIN
  v_normalized_key := normalize_genre_key(raw_genre);
  IF v_normalized_key IS NULL OR length(v_normalized_key) < 2 THEN RETURN NULL; END IF;
  SELECT id INTO v_genre_id FROM genres WHERE normalized_key = v_normalized_key;
  IF v_genre_id IS NULL THEN
    INSERT INTO genres (name, normalized_key, slug)
    VALUES ( initcap(v_normalized_key), v_normalized_key, replace(v_normalized_key, ' ', '-') )
    ON CONFLICT (normalized_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_genre_id;
  END IF;
  RETURN v_genre_id;
END;
$$;

CREATE OR REPLACE FUNCTION sync_artist_genres(p_artist_id UUID, p_raw_genres TEXT[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_genre TEXT; v_genre_id UUID;
BEGIN
  DELETE FROM artists_genres WHERE artist_id = p_artist_id;
  IF p_raw_genres IS NULL OR array_length(p_raw_genres, 1) IS NULL THEN RETURN; END IF;
  FOREACH v_genre IN ARRAY p_raw_genres LOOP
    v_genre_id := upsert_genre(v_genre);
    IF v_genre_id IS NOT NULL THEN
      INSERT INTO artists_genres (artist_id, genre_id) VALUES (p_artist_id, v_genre_id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION sync_event_genres(p_event_id UUID, p_raw_genres TEXT[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_genre TEXT; v_genre_id UUID;
BEGIN
  DELETE FROM events_genres WHERE event_id = p_event_id;
  IF p_raw_genres IS NULL OR array_length(p_raw_genres, 1) IS NULL THEN RETURN; END IF;
  FOREACH v_genre IN ARRAY p_raw_genres LOOP
    v_genre_id := upsert_genre(v_genre);
    IF v_genre_id IS NOT NULL THEN
      INSERT INTO events_genres (event_id, genre_id) VALUES (p_event_id, v_genre_id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Genres are viewable by everyone" ON genres;
CREATE POLICY "Genres are viewable by everyone" ON genres FOR SELECT USING (true);
ALTER TABLE artists_genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Artist genres are viewable by everyone" ON artists_genres;
CREATE POLICY "Artist genres are viewable by everyone" ON artists_genres FOR SELECT USING (true);
ALTER TABLE events_genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Event genres are viewable by everyone" ON events_genres;
CREATE POLICY "Event genres are viewable by everyone" ON events_genres FOR SELECT USING (true);

-- ----- 1.2 Backfill: genres table -----
SET statement_timeout = '600s';

INSERT INTO genres (name, normalized_key, slug)
SELECT DISTINCT initcap(normalize_genre_key(g)), normalize_genre_key(g), replace(normalize_genre_key(g), ' ', '-')
FROM ( SELECT unnest(genres) AS g FROM artists WHERE genres IS NOT NULL AND array_length(genres, 1) > 0 ) raw
WHERE normalize_genre_key(g) IS NOT NULL AND length(normalize_genre_key(g)) >= 2
ON CONFLICT (normalized_key) DO NOTHING;

INSERT INTO genres (name, normalized_key, slug)
SELECT DISTINCT initcap(normalize_genre_key(g)), normalize_genre_key(g), replace(normalize_genre_key(g), ' ', '-')
FROM ( SELECT unnest(genres) AS g FROM events WHERE genres IS NOT NULL AND array_length(genres, 1) > 0 ) raw
WHERE normalize_genre_key(g) IS NOT NULL AND length(normalize_genre_key(g)) >= 2
ON CONFLICT (normalized_key) DO NOTHING;

-- ----- 1.3 Backfill: artists_genres -----
INSERT INTO artists_genres (artist_id, genre_id)
SELECT DISTINCT a.id, g.id
FROM artists a
CROSS JOIN LATERAL unnest(a.genres) AS raw_genre
JOIN genres g ON g.normalized_key = normalize_genre_key(raw_genre)
WHERE a.genres IS NOT NULL AND array_length(a.genres, 1) > 0
ON CONFLICT DO NOTHING;

-- ----- 1.4 Backfill: events_genres -----
INSERT INTO events_genres (event_id, genre_id)
SELECT DISTINCT e.id, g.id
FROM events e
CROSS JOIN LATERAL unnest(e.genres) AS raw_genre
JOIN genres g ON g.normalized_key = normalize_genre_key(raw_genre)
WHERE e.genres IS NOT NULL AND array_length(e.genres, 1) > 0
ON CONFLICT DO NOTHING;

-- ############################################################################
-- PHASE 2: SIMILARITY GRAPH (co-occurrence + PMI + pruned edges)
-- ############################################################################

-- ----- 2.1 Schema -----
CREATE MATERIALIZED VIEW IF NOT EXISTS genre_cooccurrence_pairs AS
SELECT ag1.genre_id AS genre_a, ag2.genre_id AS genre_b, count(*)::bigint AS pair_count
FROM artists_genres ag1
JOIN artists_genres ag2 ON ag2.artist_id = ag1.artist_id AND ag1.genre_id < ag2.genre_id
GROUP BY ag1.genre_id, ag2.genre_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_pk ON genre_cooccurrence_pairs (genre_a, genre_b);
CREATE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_a ON genre_cooccurrence_pairs (genre_a);
CREATE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_b ON genre_cooccurrence_pairs (genre_b);

CREATE MATERIALIZED VIEW IF NOT EXISTS genre_marginals AS
SELECT genre_id, count(*)::bigint AS artist_count FROM artists_genres GROUP BY genre_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_genre_marginals_pk ON genre_marginals (genre_id);

CREATE OR REPLACE VIEW genre_similarity_pmi AS
WITH total_artists AS ( SELECT count(DISTINCT artist_id)::double precision AS n FROM artists_genres ),
pairs_with_marginals AS (
  SELECT p.genre_a, p.genre_b, p.pair_count, ma.artist_count AS count_a, mb.artist_count AS count_b, t.n AS total
  FROM genre_cooccurrence_pairs p
  JOIN genre_marginals ma ON ma.genre_id = p.genre_a
  JOIN genre_marginals mb ON mb.genre_id = p.genre_b
  CROSS JOIN total_artists t
  WHERE t.n > 0 AND ma.artist_count > 0 AND mb.artist_count > 0
)
SELECT genre_a, genre_b, pair_count,
  ln(greatest(1.0, (pair_count::double precision * total) / (count_a * count_b))) AS pmi
FROM pairs_with_marginals;

CREATE TABLE IF NOT EXISTS genre_similarity_edges (
  genre_id uuid NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  neighbor_id uuid NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  weight double precision NOT NULL,
  PRIMARY KEY (genre_id, neighbor_id),
  CONSTRAINT genre_similarity_edges_no_self CHECK (genre_id <> neighbor_id)
);

CREATE INDEX IF NOT EXISTS idx_genre_similarity_edges_genre ON genre_similarity_edges (genre_id);
CREATE INDEX IF NOT EXISTS idx_genre_similarity_edges_neighbor ON genre_similarity_edges (neighbor_id);

-- ----- 2.2 Refresh MVs and fill edges -----
SET statement_timeout = '600s';
REFRESH MATERIALIZED VIEW CONCURRENTLY genre_cooccurrence_pairs;

SET statement_timeout = '300s';
REFRESH MATERIALIZED VIEW CONCURRENTLY genre_marginals;

SET statement_timeout = '600s';
TRUNCATE genre_similarity_edges;

INSERT INTO genre_similarity_edges (genre_id, neighbor_id, weight)
SELECT genre_id, neighbor_id, weight
FROM (
  SELECT genre_id, neighbor_id, weight, row_number() OVER (PARTITION BY genre_id ORDER BY weight DESC) AS rn
  FROM (
    SELECT genre_a AS genre_id, genre_b AS neighbor_id, pmi AS weight FROM genre_similarity_pmi
    UNION ALL
    SELECT genre_b AS genre_id, genre_a AS neighbor_id, pmi AS weight FROM genre_similarity_pmi
  ) both_dirs
) ranked
WHERE rn <= 25;

-- ############################################################################
-- PHASE 3: DAG TAXONOMY (umbrellas + drop list + parent assignment + paths + helpers)
-- ############################################################################

-- ----- 3.1 Schema -----
CREATE TABLE IF NOT EXISTS genre_taxonomy_roots (
  genre_id UUID PRIMARY KEY REFERENCES genres(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_genre_taxonomy_roots_genre ON genre_taxonomy_roots (genre_id);

CREATE TABLE IF NOT EXISTS genre_parent (
  child_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  confidence double precision NOT NULL DEFAULT 1.0,
  PRIMARY KEY (child_id, parent_id),
  CONSTRAINT genre_parent_no_self CHECK (child_id <> parent_id)
);
CREATE INDEX IF NOT EXISTS idx_genre_parent_child ON genre_parent (child_id);
CREATE INDEX IF NOT EXISTS idx_genre_parent_parent ON genre_parent (parent_id);

CREATE TABLE IF NOT EXISTS genre_paths (
  genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  path_slug text NOT NULL,
  depth int NOT NULL,
  PRIMARY KEY (genre_id, path_slug)
);
CREATE INDEX IF NOT EXISTS idx_genre_paths_genre ON genre_paths (genre_id);
CREATE INDEX IF NOT EXISTS idx_genre_paths_path_slug ON genre_paths (path_slug text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_genre_paths_depth ON genre_paths (depth);

CREATE TABLE IF NOT EXISTS genre_taxonomy_exclude ( normalized_key text PRIMARY KEY );
CREATE INDEX IF NOT EXISTS idx_genre_taxonomy_exclude_key ON genre_taxonomy_exclude (normalized_key);

CREATE OR REPLACE FUNCTION genre_taxonomy_assert_dag(p_child_id uuid, p_parent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE v_is_descendant boolean;
BEGIN
  IF p_child_id = p_parent_id THEN RAISE EXCEPTION 'genre_taxonomy: child and parent cannot be the same'; END IF;
  WITH RECURSIVE descendants AS (
    SELECT child_id AS genre_id FROM genre_parent WHERE parent_id = p_child_id
    UNION
    SELECT p.child_id FROM genre_parent p JOIN descendants d ON d.genre_id = p.parent_id
  )
  SELECT EXISTS (SELECT 1 FROM descendants WHERE genre_id = p_parent_id) INTO v_is_descendant;
  IF v_is_descendant THEN RAISE EXCEPTION 'genre_taxonomy: would create cycle'; END IF;
  RETURN true;
END;
$$;

-- ----- 3.2 Seed drop list -----
INSERT INTO genre_taxonomy_exclude (normalized_key) VALUES
(' consistency'), (' edit'), ('consistency'), ('edit'), ('"foreign agent" in russia'), ('00s'), ('1 hit wonder'), ('10s'), ('1960s'), ('1980s'), ('1990s'), ('2005'), ('2008 universal fire victim'), ('2010s'), ('2016'), ('2020s'), ('3 stars'), ('5 stars'), ('60s'), ('70s'), ('80s'), ('90s'), ('<3'), ('[1]'), ('[2]'), ('[3]'), ('[4]'), ('[5]'), ('academy award winner'), ('across the universe'), ('acting'), ('actor'), ('actors'), ('actress'), ('actresses'), ('adventure'), ('all'), ('alternative singer/songwriter'), ('amazing'), ('amazing voice'), ('animator'), ('ass'), ('belgian singer'), ('broiche pop'), ('columbus'), ('cordio dio'), ('country singer'), ('eurovision 2023 artists'), ('eurovision 2024 artists'), ('exceptional voice'), ('female artists'), ('female singer'), ('femalesinger'), ('fictitious artist'), ('fiji'), ('fmera artist'), ('fuzzy artist series'), ('german voice actor'), ('guinea bissau'), ('italian singer songwriter'), ('kill your own'), ('killyourown'), ('lesser known yet streamable artists'), ('liberia'), ('liberian'), ('motion picture actors and actresses'), ('multiple artists'), ('nekromantik'), ('oregon'), ('phleng phuea chiwit'), ('portland oregon usa'), ('pudel artists'), ('rock artist'), ('salento'), ('series title as artist'), ('singer'), ('singer singwriter'), ('singer songwriter'), ('singer songwriters'), ('singer/songwriter'), ('singersong writer'), ('small artist'), ('special purpose artist'), ('the masked singer'), ('two or more artists with the same name'), ('use actual artists'), ('valencia'), ('valencian'), ('various artists are a pita on lastfm'), ('venezuela'), ('venezuelan'), ('voice actor'), ('wolfs of the masked singer'), ('yanni')
ON CONFLICT (normalized_key) DO NOTHING;

-- ----- 3.3 Seed umbrellas -----
INSERT INTO genre_taxonomy_roots (genre_id)
SELECT g.id FROM genres g
WHERE g.normalized_key IN (
  'rock','pop','electronic','hip hop','r&b','r and b','country','folk','jazz','classical','metal','punk','blues','reggae','indie','soul','dance','latin','world','alternative','ambient','experimental'
)
ON CONFLICT (genre_id) DO NOTHING;

-- ----- 3.4 Seed mid-level (50–100 manual child → parent) -----
INSERT INTO genre_parent (child_id, parent_id, confidence)
SELECT c.id, p.id, 1.0
FROM (VALUES
  ('psychedelic rock', 'rock'), ('acid rock', 'psychedelic rock'), ('experimental rock', 'rock'),
  ('indie rock', 'rock'), ('alternative rock', 'rock'), ('hard rock', 'rock'), ('punk rock', 'punk'),
  ('folk rock', 'folk'), ('country rock', 'country'),
  ('house', 'electronic'), ('techno', 'electronic'), ('trance', 'electronic'), ('drum and bass', 'electronic'),
  ('dubstep', 'electronic'), ('ambient', 'electronic'), ('idm', 'electronic'),
  ('rap', 'hip hop'), ('trap', 'hip hop'), ('boom bap', 'hip hop'),
  ('singer songwriter', 'folk'), ('americana', 'country'), ('bluegrass', 'country'),
  ('smooth jazz', 'jazz'), ('bebop', 'jazz'), ('death metal', 'metal'), ('thrash metal', 'metal'),
  ('post punk', 'punk'), ('ska', 'reggae'), ('downtempo', 'electronic'), ('synth pop', 'pop')
) AS mid(child_key, parent_key)
JOIN genres c ON c.normalized_key = mid.child_key
JOIN genres p ON p.normalized_key = mid.parent_key
WHERE c.id != p.id
ON CONFLICT (child_id, parent_id) DO UPDATE SET confidence = EXCLUDED.confidence;

-- ----- 3.5 Assign parents from similarity (up to 3 parents per genre) -----
SET statement_timeout = '600s';

DO $$
DECLARE
  v_g uuid;
  v_rec record;
  v_min_count bigint := 5;
  v_max_parents int := 3;
  v_min_weight double precision := 0.3;
BEGIN
  FOR v_g IN
    SELECT m.genre_id FROM genre_marginals m
    JOIN genres g ON g.id = m.genre_id
    WHERE m.genre_id NOT IN (SELECT genre_id FROM genre_taxonomy_roots)
      AND m.artist_count >= v_min_count
      AND g.normalized_key NOT IN (SELECT normalized_key FROM genre_taxonomy_exclude)
    ORDER BY m.artist_count DESC
  LOOP
    FOR v_rec IN
      SELECT cand.parent_id, cand.weight
      FROM (
        SELECT CASE WHEN e.genre_id = v_g THEN e.neighbor_id ELSE e.genre_id END AS parent_id, e.weight,
          m_p.artist_count AS parent_count, m_g.artist_count AS g_count
        FROM genre_similarity_edges e
        JOIN genre_marginals m_g ON m_g.genre_id = v_g
        JOIN genre_marginals m_p ON m_p.genre_id = (CASE WHEN e.genre_id = v_g THEN e.neighbor_id ELSE e.genre_id END)
        WHERE (e.genre_id = v_g OR e.neighbor_id = v_g)
          AND (CASE WHEN e.genre_id = v_g THEN e.neighbor_id ELSE e.genre_id END) IN (
            SELECT genre_id FROM genre_taxonomy_roots UNION SELECT child_id FROM genre_parent
          )
          AND (CASE WHEN e.genre_id = v_g THEN e.neighbor_id ELSE e.genre_id END) NOT IN (SELECT id FROM genres WHERE normalized_key IN (SELECT normalized_key FROM genre_taxonomy_exclude))
          AND (CASE WHEN e.genre_id = v_g THEN e.neighbor_id ELSE e.genre_id END) NOT IN (
            WITH RECURSIVE descendants AS (
              SELECT child_id AS genre_id FROM genre_parent WHERE parent_id = v_g
              UNION
              SELECT p.child_id FROM genre_parent p JOIN descendants d ON d.genre_id = p.parent_id
            )
            SELECT genre_id FROM descendants
          )
          AND e.weight >= v_min_weight
      ) cand
      ORDER BY (cand.parent_count >= cand.g_count) DESC, cand.weight DESC
      LIMIT v_max_parents
    LOOP
      BEGIN
        PERFORM genre_taxonomy_assert_dag(v_g, v_rec.parent_id);
        INSERT INTO genre_parent (child_id, parent_id, confidence)
        VALUES (v_g, v_rec.parent_id, least(1.0, greatest(0.0, v_rec.weight / 3.0)))
        ON CONFLICT (child_id, parent_id) DO UPDATE SET confidence = EXCLUDED.confidence;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
END;
$$;

-- ----- 3.6 Build paths -----
SET statement_timeout = '600s';

TRUNCATE genre_paths;

INSERT INTO genre_paths (genre_id, path_slug, depth)
SELECT g.id, g.slug, 0 FROM genres g JOIN genre_taxonomy_roots r ON r.genre_id = g.id;

INSERT INTO genre_paths (genre_id, path_slug, depth)
WITH RECURSIVE walk AS (
  SELECT g.id AS genre_id, g.slug AS path_slug, 0 AS depth
  FROM genres g JOIN genre_taxonomy_roots r ON r.genre_id = g.id
  UNION ALL
  SELECT g.id, w.path_slug || '.' || g.slug, w.depth + 1
  FROM genre_parent gp JOIN walk w ON w.genre_id = gp.parent_id JOIN genres g ON g.id = gp.child_id
)
SELECT genre_id, path_slug, depth FROM walk WHERE depth > 0
ON CONFLICT (genre_id, path_slug) DO UPDATE SET depth = EXCLUDED.depth;

-- ----- 3.7 Helpers (get_genres_under_umbrella + genre_cluster_keys) -----
CREATE OR REPLACE FUNCTION get_genres_under_umbrella(p_slug text, p_max_depth int DEFAULT 5)
RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  SELECT DISTINCT p.genre_id FROM genre_paths p
  JOIN genres g ON g.id = p.genre_id
  WHERE (p.path_slug = p_slug OR p.path_slug LIKE p_slug || '.%') AND p.depth <= p_max_depth
    AND g.normalized_key NOT IN (SELECT normalized_key FROM genre_taxonomy_exclude);
$$;

CREATE OR REPLACE VIEW genre_cluster_keys AS
WITH best_path AS (
  SELECT DISTINCT ON (p.genre_id) p.genre_id, p.path_slug, p.depth
  FROM genre_paths p
  JOIN genre_marginals m ON m.genre_id = p.genre_id AND m.artist_count >= 5
  JOIN genres g ON g.id = p.genre_id
  WHERE g.normalized_key NOT IN (SELECT normalized_key FROM genre_taxonomy_exclude)
  ORDER BY p.genre_id, p.depth ASC
)
SELECT genre_id, split_part(path_slug, '.', 1) AS umbrella_slug,
  CASE WHEN depth = 0 THEN path_slug ELSE split_part(path_slug, '.', 1) || '.' || split_part(path_slug, '.', 2) END AS cluster_path_slug
FROM best_path;

-- ############################################################################
-- VERIFICATION (optional — run to sanity-check)
-- ############################################################################

-- ----- Phase 1 verify: backfill counts -----
SELECT 'genres' AS table_name, count(*) AS row_count FROM genres
UNION ALL
SELECT 'artists_genres', count(*) FROM artists_genres
UNION ALL
SELECT 'events_genres', count(*) FROM events_genres
UNION ALL
SELECT 'artists with genres', count(DISTINCT artist_id) FROM artists_genres
UNION ALL
SELECT 'events with genres', count(DISTINCT event_id) FROM events_genres;

-- ----- Phase 2 verify: similarity counts + sample -----
SELECT 'genre_cooccurrence_pairs' AS object_name, count(*) AS row_count FROM genre_cooccurrence_pairs
UNION ALL
SELECT 'genre_marginals', count(*) FROM genre_marginals
UNION ALL
SELECT 'genre_similarity_edges', count(*) FROM genre_similarity_edges;

SELECT
  count(*) AS genres_with_edges,
  min(edge_count) AS min_edges,
  max(edge_count) AS max_edges,
  round(avg(edge_count), 2) AS avg_edges
FROM (
  SELECT genre_id, count(*) AS edge_count
  FROM genre_similarity_edges
  GROUP BY genre_id
) t;

SELECT g.name AS genre, g_neighbor.name AS neighbor, round(e.weight::numeric, 4) AS pmi
FROM genre_similarity_edges e
JOIN genres g ON g.id = e.genre_id
JOIN genres g_neighbor ON g_neighbor.id = e.neighbor_id
WHERE g.normalized_key IN ('rock', 'hip hop', 'electronic')
ORDER BY g.name, e.weight DESC
LIMIT 20;

SELECT
  ga.name AS genre_a,
  gb.name AS genre_b,
  p.pair_count,
  round(v.pmi::numeric, 4) AS pmi
FROM genre_cooccurrence_pairs p
JOIN genre_similarity_pmi v ON v.genre_a = p.genre_a AND v.genre_b = p.genre_b
JOIN genres ga ON ga.id = p.genre_a
JOIN genres gb ON gb.id = p.genre_b
ORDER BY p.pair_count DESC
LIMIT 10;

-- ----- Phase 3 validate: taxonomy counts + checks + sample paths -----
SELECT 'genre_taxonomy_roots' AS object_name, count(*) AS row_count FROM genre_taxonomy_roots
UNION ALL SELECT 'genre_parent', count(*) FROM genre_parent
UNION ALL SELECT 'genre_paths', count(*) FROM genre_paths
UNION ALL SELECT 'genre_taxonomy_exclude (drop list)', count(*) FROM genre_taxonomy_exclude;

SELECT 'roots_with_paths' AS check_name, count(*) AS row_count
FROM genre_taxonomy_roots r
JOIN genre_paths p ON p.genre_id = r.genre_id AND p.depth = 0
JOIN genres g ON g.id = r.genre_id AND g.slug = p.path_slug;

SELECT 'orphan_children_no_path' AS check_name, count(*) AS row_count
FROM genre_parent gp
WHERE gp.child_id NOT IN (SELECT genre_id FROM genre_paths);

SELECT 'cluster_keys_count' AS check_name, count(*) AS row_count FROM genre_cluster_keys;

WITH sample_paths AS (
  SELECT path_slug, depth
  FROM genre_paths
  WHERE depth BETWEEN 1 AND 4
  ORDER BY random()
  LIMIT 5
),
segments AS (
  SELECT sp.path_slug, sp.depth, ord AS seg_pos, seg AS slug
  FROM sample_paths sp,
       unnest(string_to_array(sp.path_slug, '.')) WITH ORDINALITY AS t(seg, ord)
),
with_names AS (
  SELECT s.path_slug, s.depth, s.seg_pos, g.name
  FROM segments s
  JOIN genres g ON g.slug = s.slug
)
SELECT path_slug, depth, string_agg(name, ' → ' ORDER BY seg_pos) AS path_display
FROM with_names
GROUP BY path_slug, depth
ORDER BY depth, path_slug;

WITH one_path AS (
  SELECT path_slug, depth
  FROM genre_paths
  WHERE path_slug LIKE 'rock.%' AND depth BETWEEN 2 AND 4
  ORDER BY depth DESC
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

-- ----- Done -----
SELECT 'genre_one_time_full_run completed' AS status;
