-- =============================================================================
-- DAG TAXONOMY: Assign parents for non-roots from co-occurrence graph
-- Process genres by descending artist_count; assign up to max_parents (e.g. 2–3)
-- per genre when similarity supports it (multiple parents = realistic DAG).
-- Genres with artist_count below threshold are skipped.
-- Run after genre_taxonomy_seed_umbrellas.sql, genre_taxonomy_seed_drop_list.sql,
-- and optionally genre_taxonomy_seed_mid_level.sql.
-- Requires genre_marginals and genre_similarity_edges.
-- =============================================================================

SET statement_timeout = '600s';

DO $$
DECLARE
  v_g uuid;
  v_rec record;
  v_min_count bigint := 5;
  v_max_parents int := 3;   -- allow multiple parents per genre (spec: "when needed")
  v_min_weight double precision := 0.3;  -- skip very weak edges
BEGIN
  FOR v_g IN
    SELECT m.genre_id
    FROM genre_marginals m
    JOIN genres g ON g.id = m.genre_id
    WHERE m.genre_id NOT IN (SELECT genre_id FROM genre_taxonomy_roots)
      AND m.artist_count >= v_min_count
      AND g.normalized_key NOT IN (SELECT normalized_key FROM genre_taxonomy_exclude)
    ORDER BY m.artist_count DESC
  LOOP
    FOR v_rec IN
      SELECT cand.parent_id, cand.weight
      FROM (
        SELECT
          CASE WHEN e.genre_id = v_g THEN e.neighbor_id ELSE e.genre_id END AS parent_id,
          e.weight,
          m_p.artist_count AS parent_count,
          m_g.artist_count AS g_count
        FROM genre_similarity_edges e
        JOIN genre_marginals m_g ON m_g.genre_id = v_g
        JOIN genre_marginals m_p ON m_p.genre_id = (CASE WHEN e.genre_id = v_g THEN e.neighbor_id ELSE e.genre_id END)
        WHERE (e.genre_id = v_g OR e.neighbor_id = v_g)
          AND (CASE WHEN e.genre_id = v_g THEN e.neighbor_id ELSE e.genre_id END) IN (
            SELECT genre_id FROM genre_taxonomy_roots
            UNION
            SELECT child_id FROM genre_parent
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
        NULL;  -- skip this parent (e.g. cycle); continue with next candidate
      END;
    END LOOP;
  END LOOP;
END;
$$;
