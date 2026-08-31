-- =============================================================================
-- Index cleanup — REVIEW ONLY.
--
-- Run each numbered block SEPARATELY. Do not paste the file.
--
-- NOTE: uses plain DROP INDEX, not CONCURRENTLY. The Supabase web editor wraps
-- every paste in a transaction and CONCURRENTLY cannot run inside one (25001).
-- Plain DROP INDEX is correct here anyway: it deletes a catalog row and unlinks
-- a file, it does not scan or rebuild, so it finishes in milliseconds. It does
-- take a brief ACCESS EXCLUSIVE lock on the table, so lock_timeout is set to
-- fail fast instead of queueing behind a long query and blocking everything.
-- =============================================================================


-- ##### BLOCK 1 — duplicate indexes on small/cold tables ######################
-- A plain btree sitting on top of a UNIQUE btree with the identical column
-- list. The UNIQUE index already serves every lookup; the twin is write cost
-- only. (storage.* and auth.* duplicates are Supabase-managed — leave them.)
set lock_timeout = '5s';
drop index if exists public.idx_users_username;                     -- keep idx_users_username_unique
drop index if exists public.idx_users_user_id;                      -- keep users_new_user_id_key
drop index if exists public.idx_genres_slug;                        -- keep genres_slug_key
drop index if exists public.idx_genres_normalized_key;              -- keep genres_normalized_key_key
drop index if exists public.idx_achievements_key;                   -- keep achievements_achievement_key_key
drop index if exists public.idx_scenes_slug;                        -- keep scenes_slug_key
drop index if exists public.idx_user_settings_user_id;              -- keep user_settings_user_id_key
drop index if exists public.user_settings_preferences_user_id_idx;  -- keep user_settings_preferences_user_id_key
drop index if exists public.idx_content_feed_items_slug;            -- keep content_feed_items_slug_key
drop index if exists public.idx_jambase_events_jambase_event_id;    -- keep jambase_events_jambase_event_id_key
drop index if exists public.idx_genre_taxonomy_exclude_key;         -- keep genre_taxonomy_exclude_pkey
drop index if exists public.idx_genre_taxonomy_roots_genre;         -- keep genre_taxonomy_roots_pkey
drop index if exists public.idx_user_relationships_bidirectional;   -- keep user_relationships_..._key
drop index if exists public.idx_social_media_follower_snapshots_platform_date;
reset lock_timeout;


-- ##### BLOCK 2 — artists ####################################################
set lock_timeout = '5s';
drop index if exists public.idx_artists_identifier;    -- duplicate of artists_new_identifier_key
drop index if exists public.idx_artists_artist_type;   -- 744 kB, 0 lifetime scans
reset lock_timeout;


-- ##### BLOCK 3 — venues #####################################################
-- Four indexes, zero lifetime scans between them. venues takes 74,941 UPDATEs
-- per sync cycle and rebuilds every one of these each time.
set lock_timeout = '5s';
drop index if exists public.idx_venues_last_synced;  -- 4.4 MB, 0 scans
drop index if exists public.idx_venues_name;         -- 1.8 MB, 0 scans
drop index if exists public.idx_venues_identifier;   -- 1.8 MB, 0 scans (venues_location_key_uidx is the live one)
drop index if exists public.idx_venues_city;         -- 656 kB, 0 scans
reset lock_timeout;


-- ##### BLOCK 4 — events (the hot write table) ###############################
-- events INSERT averages 2,114 ms and is 21.8% of total DB time. Every index
-- below is rebuilt on each insert to serve almost no reads.
set lock_timeout = '5s';
drop index if exists public.idx_events_date_location;       -- 28 MB, 14 scans
drop index if exists public.idx_events_city_state_coords;   -- 24 MB, 4 scans
drop index if exists public.idx_events_created_at_id;       -- 20 MB, 24 scans
drop index if exists public.idx_events_title;               -- 18 MB, 17 scans; a btree cannot serve ILIKE, the trigram index does
drop index if exists public.idx_events_event_media_url;     -- 4.5 MB, 0 scans
reset lock_timeout;

-- KEEP these, low scan counts notwithstanding:
--   idx_events_title_trigram      53 MB,  36 scans -- backs title search, no btree substitute
--   idx_events_geo_date_covering  49 MB, 424 scans -- covering index for the geo feed
--   idx_events_latitude_longitude 13 MB, 128 scans -- confirm geo_date_covering supersedes before touching


-- ##### BLOCK 5 — external_entity_ids ########################################
set lock_timeout = '5s';
drop index if exists public.external_entity_ids_type_source_idx;  -- 3.9 MB, 1 scan
reset lock_timeout;

-- Redundant UNIQUE constraint — CONFIRMED by 01 section C. Two constraints over
-- the same three columns, only the order differs; uniqueness is order-independent,
-- so one is pure duplicate work maintained on all 207,621 inserts.
--   external_entity_ids_entity_type_source_external_id_key  UNIQUE (entity_type, source, external_id)
--   external_entity_ids_source_type_external_id_uniq        UNIQUE (source, entity_type, external_id)
-- Keep the (source, entity_type, external_id) one — it matches how the sync
-- looks up, source first. Run this alone:
alter table public.external_entity_ids
  drop constraint if exists external_entity_ids_entity_type_source_external_id_key;


-- ##### BLOCK 6 — indexes to ADD #############################################
-- interactions: the two hot queries are
--   WHERE (occurred_at >= $1 OR created_at >= $2) ORDER BY created_at   2,959 calls, 17.5 ms
--   WHERE created_at >= $1 ORDER BY created_at                          2,928 calls,  6.4 ms
-- idx_interactions_occurred_at already exists. Adding created_at lets the
-- planner serve the second query directly and BitmapOr the first.
-- 22k rows, so a plain CREATE INDEX is instant — CONCURRENTLY is not needed.
create index if not exists idx_interactions_created_at
  on public.interactions (created_at);

-- message_reactions.user_id is an FK with no index.
create index if not exists idx_message_reactions_user_id
  on public.message_reactions (user_id);

-- The other 20 FK-without-index hits are near-empty admin tables. An index on
-- an empty table is write cost with no read benefit — skip until they grow.


-- ##### BLOCK 7 — leftover work tables #######################################
-- Dedup jobs are complete and verified. Safe:
--   drop table if exists public.venue_dedup_map;      -- + its 3.7 MB index
--   drop table if exists public._venue_canon;
--   drop table if exists public._venue_canon_unique;  -- 2.9 MB
--   drop table if exists public.event_dedup_map;      -- 960 kB
-- Backups — KEEP as audit trail unless you are certain:
--   events_dedup_backup, genre_placeholder_backup_20260820,
--   users_backup_20260715 (0 rows, partner's — ask first),
--   _device_token_dedup_2026_08_02_backup
