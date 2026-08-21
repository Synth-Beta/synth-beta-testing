-- ============================================================================
-- 04 — Merge genres rows that are the same genre spelled differently.
-- ============================================================================
--
-- public.genres holds 2,911 rows, of which 49 are punctuation/spacing variants
-- of a row that already exists. Verified live 2026-08-20 -- 44 collision groups
-- when names are compared with all non-alphanumerics stripped:
--
--     hip-hop/rap          + hip-hop-rap
--     lo-fi                + lofi
--     k-pop                + kpop
--     pop-rock + poprock   + pop/rock
--     pop-punk             + poppunk
--     singer-songwriter + singer/songwriter + singersong-writer
--     jam-band             + jamband
--     ... and 37 more
--
-- WHY THIS MATTERS
-- ----------------
-- 1. It breaks the canonicalisation in refresh_user_preferences_v5. That
--    function's whole job is to collapse "pop"/"Pop"/"jamband"/"Jam Band" onto
--    one canonical row -- it cannot, because there are genuinely two rows. A
--    user who likes "Jam Band" and an event tagged "jamband" resolve to two
--    different slugs and never match, even after 01_.
-- 2. "Hip-Hop/Rap" is one of the top orphan tags on upcoming events (34 in a
--    40k sample) -- events reachable by no genre chat purely because of
--    punctuation.
--
-- WINNER SELECTION is data-driven, not alphabetical: the surviving row is the
-- one with the most existing events_genres + artists_genres references, so the
-- merge moves the FEWEST rows and keeps the slug that already matches the tag
-- format in events.genres. Ties break to the shorter slug, then the older row.
--
-- ORDERING: run last (01 -> 02 -> enrich -> 03 -> 04). Re-run
-- refresh_user_preferences_v5() afterwards so preference keys pick up the
-- surviving slugs.
--
-- CHECK FIRST: this deletes rows from public.genres. Confirm what references
-- them before running, so nothing is blocked or unexpectedly cascaded:
--
--   SELECT tc.table_name, kcu.column_name, rc.delete_rule
--   FROM information_schema.table_constraints tc
--   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
--   JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
--   JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
--   WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'genres';

BEGIN;

-- ── Build the merge map ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genre_merge_map_20260820 (
  loser_id     uuid PRIMARY KEY,
  loser_slug   text,
  winner_id    uuid NOT NULL,
  winner_slug  text,
  collapse_key text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.genre_merge_map_20260820 (loser_id, loser_slug, winner_id, winner_slug, collapse_key)
WITH keyed AS (
  SELECT
    g.id,
    g.slug,
    regexp_replace(lower(g.name), '[^a-z0-9]', '', 'g') AS collapse_key,
    g.created_at,
    (SELECT count(*) FROM public.events_genres eg  WHERE eg.genre_id = g.id)
  + (SELECT count(*) FROM public.artists_genres ag WHERE ag.genre_id = g.id) AS ref_count
  FROM public.genres g
  WHERE regexp_replace(lower(g.name), '[^a-z0-9]', '', 'g') <> ''
),
ranked AS (
  SELECT
    k.*,
    count(*)      OVER (PARTITION BY k.collapse_key) AS grp_size,
    first_value(k.id)   OVER (PARTITION BY k.collapse_key
                              ORDER BY k.ref_count DESC, length(k.slug) ASC, k.created_at ASC) AS winner_id,
    first_value(k.slug) OVER (PARTITION BY k.collapse_key
                              ORDER BY k.ref_count DESC, length(k.slug) ASC, k.created_at ASC) AS winner_slug
  FROM keyed k
)
SELECT r.id, r.slug, r.winner_id, r.winner_slug, r.collapse_key
FROM ranked r
WHERE r.grp_size > 1
  AND r.id <> r.winner_id
ON CONFLICT (loser_id) DO NOTHING;

-- ── Repoint the join tables onto the winner ────────────────────────────────
-- ON CONFLICT DO NOTHING: an event may already be linked to both spellings, in
-- which case the loser link is simply dropped rather than duplicated.
INSERT INTO public.events_genres (event_id, genre_id)
SELECT eg.event_id, m.winner_id
FROM public.events_genres eg
JOIN public.genre_merge_map_20260820 m ON m.loser_id = eg.genre_id
ON CONFLICT DO NOTHING;

DELETE FROM public.events_genres eg
USING public.genre_merge_map_20260820 m
WHERE eg.genre_id = m.loser_id;

INSERT INTO public.artists_genres (artist_id, genre_id)
SELECT ag.artist_id, m.winner_id
FROM public.artists_genres ag
JOIN public.genre_merge_map_20260820 m ON m.loser_id = ag.genre_id
ON CONFLICT DO NOTHING;

DELETE FROM public.artists_genres ag
USING public.genre_merge_map_20260820 m
WHERE ag.genre_id = m.loser_id;

-- ── Drop derived taxonomy rows referencing losers ──────────────────────────
-- genre_parent / genre_paths / genre_similarity_edges are derived, rebuildable,
-- and already documented as unreliable for chat routing (see the header of
-- packages/synth-shared/src/genreEvents.ts). Removing loser references rather
-- than remapping them avoids inventing edges that were never computed.
DELETE FROM public.genre_parent gp
USING public.genre_merge_map_20260820 m
WHERE gp.child_id = m.loser_id OR gp.parent_id = m.loser_id;

DELETE FROM public.genre_paths gpa
USING public.genre_merge_map_20260820 m
WHERE gpa.genre_id = m.loser_id;

DELETE FROM public.genre_similarity_edges gse
USING public.genre_merge_map_20260820 m
WHERE gse.genre_id = m.loser_id OR gse.neighbor_id = m.loser_id;

-- ── Finally remove the duplicate genre rows ────────────────────────────────
DELETE FROM public.genres g
USING public.genre_merge_map_20260820 m
WHERE g.id = m.loser_id;

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- Expect ~49 mapped losers and 0 remaining collisions.
--
-- SELECT count(*) AS merged FROM public.genre_merge_map_20260820;
--
-- SELECT regexp_replace(lower(name), '[^a-z0-9]', '', 'g') AS k, count(*), array_agg(slug)
-- FROM public.genres
-- GROUP BY 1 HAVING count(*) > 1;      -- expect 0 rows
--
-- SELECT count(*) AS orphaned_join_rows
-- FROM public.events_genres eg
-- LEFT JOIN public.genres g ON g.id = eg.genre_id
-- WHERE g.id IS NULL;                  -- expect 0
--
-- Then re-key preferences onto the surviving slugs:
-- SELECT public.refresh_user_preferences_v5();

-- ── SCHEMA NOTE ────────────────────────────────────────────────────────────
-- Column names above were confirmed against the live schema on 2026-08-20:
--   genre_parent           (child_id, parent_id, confidence)
--   genre_paths            (genre_id, path_slug, depth)
--   genre_similarity_edges (genre_id, neighbor_id, weight)
--   events_genres          (event_id, genre_id, created_at)
--   artists_genres         (artist_id, genre_id, created_at)
--
-- genre_paths.path_slug is denormalised TEXT that may still embed a merged-away
-- slug. Nothing in the app reads genre_paths for chat routing today (see the
-- header of packages/synth-shared/src/genreEvents.ts), so it is left alone
-- here; rebuild it from genre_parent if you ever start relying on it.
