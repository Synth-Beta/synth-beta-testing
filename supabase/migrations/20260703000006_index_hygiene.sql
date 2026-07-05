-- DB integrity fixes, part 2 of 3: index hygiene (audit 2026-07-03)
--
-- Two problems, both verified against prod catalogs + Supabase advisors:
--  A) DUPLICATE / REDUNDANT indexes (~30 MB wasted, and every one slows every
--     INSERT/UPDATE on its table -- events takes bulk writes from the
--     Ticketmaster/JamBase sync, so it pays this tax constantly).
--  B) 11 foreign keys with no covering index (advisor: unindexed_foreign_keys)
--     -- these make FK checks and reverse lookups (e.g. "delete a notification
--     -> check push_notification_queue") full-table scans.
--
-- Zero app-logic change: dropping an exact duplicate index never changes query
-- results or plans (the surviving twin serves the same scans); adding indexes
-- only speeds things up. Safe to run as one normal transaction -- all these
-- tables are small except events, where DROP INDEX takes only a brief lock.
-- (Using plain CREATE INDEX, not CONCURRENTLY, so the file runs as one batch;
-- the 11 new indexes are on small tables where the build is instant.)

-- ---------------------------------------------------------------------------
-- A. Drop exact duplicates (advisor-confirmed identical twins; keep one each)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_events_artist_uuid;              -- = idx_events_artist_id (btree artist_id, ~5.5MB)
DROP INDEX IF EXISTS public.idx_events_venue_uuid;               -- = idx_events_venue_id (btree venue_id, ~4.5MB)
DROP INDEX IF EXISTS public.idx_events_genres_gin;               -- = idx_events_genres (gin genres, ~3.3MB)
DROP INDEX IF EXISTS public.idx_messages_chat_id_created_at;     -- = idx_messages_chat_created (chat_id, created_at DESC)
DROP INDEX IF EXISTS public.idx_user_preferences_genre_scores_gin; -- = idx_user_preferences_genre_scores (gin)
DROP INDEX IF EXISTS public.idx_user_preferences_user;           -- = idx_user_preferences_user_id, and BOTH are
DROP INDEX IF EXISTS public.idx_user_preferences_user_id;        --   redundant with UNIQUE user_preferences_new_user_id_key1

-- Redundant with an existing unique/pkey or composite index on the same
-- leading column(s):
DROP INDEX IF EXISTS public.idx_events_id;                       -- = events_pkey (btree id)
DROP INDEX IF EXISTS public.idx_events_event_date;               -- prefix of idx_events_event_date_id (event_date, id)
DROP INDEX IF EXISTS public.idx_artist_follows_user_artist;      -- = UNIQUE artist_follows_unique (user_id, artist_id)
DROP INDEX IF EXISTS public.idx_artist_follows_user_id;          -- prefix of artist_follows_unique
DROP INDEX IF EXISTS public.idx_user_venue_relationships_user_venue; -- = UNIQUE user_venue_relationships_unique
DROP INDEX IF EXISTS public.idx_user_venue_rel_user_id;          -- prefix of user_venue_relationships_unique

-- ---------------------------------------------------------------------------
-- B. Cover the 11 unindexed foreign keys (column names verified in catalog)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chats_latest_message_id
  ON public.chats (latest_message_id) WHERE latest_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chats_group_admin_id
  ON public.chats (group_admin_id) WHERE group_admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_feed_items_created_by
  ON public.content_feed_items (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_feed_items_updated_by
  ON public.content_feed_items (updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_reminders_sent_notification_id
  ON public.event_reminders_sent (notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_genre_cooccurrence_pairs_genre_b
  ON public.genre_cooccurrence_pairs (genre_b);
CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_reviewed_by
  ON public.missing_entity_requests (reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_profile_user_id
  ON public.notifications (profile_user_id) WHERE profile_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_notification_queue_notification_id
  ON public.push_notification_queue (notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_notification_queue_user_id
  ON public.push_notification_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_scenes_created_by
  ON public.scenes (created_by) WHERE created_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- NOT done here: the advisor also flags 177 "unused" indexes. Usage stats
-- only cover the period since the last stats reset, so mass-dropping on that
-- signal alone risks killing an index a monthly job depends on. Revisit after
-- 30+ days of production traffic and drop in small, reviewed batches.
-- ---------------------------------------------------------------------------
