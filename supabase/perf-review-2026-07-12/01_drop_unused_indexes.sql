-- =============================================================================
-- 01 — Drop unused indexes  (Finding 2)
-- Advisor: unused_index. Verified idx_scan = 0 in pg_stat_user_indexes.
-- =============================================================================
--
-- WHY: each index is written on every INSERT/UPDATE to its table. An index with
--   zero reads is pure write-overhead + storage. These are confirmed unused.
--   ~100 MB reclaimed and faster writes (helps the JamBase sync throughput).
--
-- SAFETY EXCLUSIONS (intentionally NOT dropped — support venue dedup / Finding 1):
--   idx_venues_sync_coord_lookup           (sync coordinate dedup lookup)
--   external_entity_ids_type_source_idx    (entity dedup lookups)
--   Leave these until the venue-duplication fix is done.
--
-- CAUTION: a few events/venues indexes below back admin or seasonal queries that
--   may not have run since the stats were last reset. They're low-risk to drop
--   (recreate from the rollback if a report slows down), but review DRY RUN 2
--   and SAVE its output before proceeding — that is your rollback.
--
-- -----------------------------------------------------------------------------
-- DRY RUN 1 — what's unused and how big (re-run after to confirm gone)
-- -----------------------------------------------------------------------------
SELECT s.relname AS table, s.indexrelname AS index,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size, s.idx_scan
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname='public' AND s.idx_scan = 0
  AND NOT i.indisprimary AND NOT i.indisunique
  AND s.indexrelname NOT IN ('idx_venues_sync_coord_lookup','external_entity_ids_type_source_idx')
ORDER BY pg_relation_size(s.indexrelid) DESC;

-- -----------------------------------------------------------------------------
-- DRY RUN 2 — YOUR ROLLBACK. Run this, copy the output somewhere safe. These are
--   the CREATE statements to restore any index you later find you needed.
-- -----------------------------------------------------------------------------
SELECT pg_get_indexdef(s.indexrelid) || ';' AS restore_stmt
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname='public' AND s.idx_scan = 0
  AND NOT i.indisprimary AND NOT i.indisunique
  AND s.indexrelname NOT IN ('idx_venues_sync_coord_lookup','external_entity_ids_type_source_idx')
ORDER BY pg_relation_size(s.indexrelid) DESC;

-- -----------------------------------------------------------------------------
-- APPLY — explicit drops for the space-significant indexes (>100 kB).
--   Plain DROP INDEX (no CONCURRENTLY) so the whole block runs in one go in the
--   Supabase SQL editor (which wraps scripts in a transaction; CONCURRENTLY is
--   forbidden there). Dropping an index takes only a momentary lock — unlike
--   CREATE INDEX, there's no table scan — so this is safe to run live. IF EXISTS
--   makes re-runs safe.
--   (If you prefer zero lock, run each statement with CONCURRENTLY individually,
--    one at a time, NOT wrapped in a transaction.)
-- -----------------------------------------------------------------------------
-- artists
DROP INDEX IF EXISTS public.idx_artists_external_identifiers;   -- 15 MB
DROP INDEX IF EXISTS public.idx_artists_genres;                 -- 1.8 MB
DROP INDEX IF EXISTS public.idx_artists_same_as;               -- 1.4 MB
DROP INDEX IF EXISTS public.idx_artists_band_or_musician;      -- 776 kB

-- venues  (NOT idx_venues_sync_coord_lookup — needed for dedup)
DROP INDEX IF EXISTS public.idx_venues_geo;                     -- 13 MB
DROP INDEX IF EXISTS public.idx_venues_same_as;                -- 6.8 MB
DROP INDEX IF EXISTS public.idx_venues_country;                -- 6 MB
DROP INDEX IF EXISTS public.idx_venues_zip;                    -- 5.6 MB
DROP INDEX IF EXISTS public.idx_venues_typical_genres;         -- 2 MB

-- events  (review: these back city/state/status filters — confirm the feed
--          doesn't use them; advisor says idx_scan=0)
DROP INDEX IF EXISTS public.idx_events_venue_city;             -- 3.7 MB
DROP INDEX IF EXISTS public.idx_events_venue_state;            -- 3.7 MB
DROP INDEX IF EXISTS public.idx_events_genres;                 -- 3.6 MB
DROP INDEX IF EXISTS public.idx_events_doors_time;             -- 3.5 MB
DROP INDEX IF EXISTS public.idx_events_event_status;           -- 3.5 MB
DROP INDEX IF EXISTS public.idx_events_media_urls;             -- 2.1 MB

-- genre_paths / city_centers  (0-row / staging tables)
DROP INDEX IF EXISTS public.idx_genre_paths_path_slug;         -- 10 MB
DROP INDEX IF EXISTS public.idx_city_centers_coordinates;      -- 1.9 MB
DROP INDEX IF EXISTS public.idx_city_centers_name;             -- 1.7 MB
DROP INDEX IF EXISTS public.idx_city_centers_state;            -- 336 kB

-- genres (tiny table, seq scan is fine)
DROP INDEX IF EXISTS public.idx_genres_name_trgm;              -- 320 kB
DROP INDEX IF EXISTS public.idx_genres_normalized_key_trgm;    -- 320 kB

-- misc >100 kB
DROP INDEX IF EXISTS public.idx_chats_is_verified;            -- 280 kB
DROP INDEX IF EXISTS public.idx_chats_verified_activity;      -- 280 kB
DROP INDEX IF EXISTS public.idx_interactions_session_id;      -- 280 kB
DROP INDEX IF EXISTS public.idx_user_pref_signals_context;    -- 280 kB
DROP INDEX IF EXISTS public.idx_user_pref_signals_user_weight;-- 280 kB
DROP INDEX IF EXISTS public.idx_users_permissions_metadata;   -- 192 kB
DROP INDEX IF EXISTS public.idx_user_preferences_genre_scores;-- 144 kB
DROP INDEX IF EXISTS public.idx_interactions_entity_type_uuid;-- 128 kB
DROP INDEX IF EXISTS public.idx_user_preferences_artist_scores;-- 104 kB

-- -----------------------------------------------------------------------------
-- OPTIONAL — drop ALL remaining zero-scan non-constraint indexes (the many
--   8–96 kB ones). Space is negligible but it removes write-overhead. Review the
--   DRY RUN 1 list first. CONCURRENTLY can't run inside a DO block, so this uses
--   a plain (briefly locking) DROP. Run in a quiet window, or skip.
-- -----------------------------------------------------------------------------
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN
--     SELECT s.indexrelname
--     FROM pg_stat_user_indexes s
--     JOIN pg_index i ON i.indexrelid = s.indexrelid
--     WHERE s.schemaname='public' AND s.idx_scan = 0
--       AND NOT i.indisprimary AND NOT i.indisunique
--       AND s.indexrelname NOT IN ('idx_venues_sync_coord_lookup','external_entity_ids_type_source_idx')
--   LOOP
--     EXECUTE format('DROP INDEX IF EXISTS public.%I;', r.indexrelname);
--   END LOOP;
-- END $$;

-- -----------------------------------------------------------------------------
-- ROLLBACK: paste the statements you saved from DRY RUN 2.
-- -----------------------------------------------------------------------------
