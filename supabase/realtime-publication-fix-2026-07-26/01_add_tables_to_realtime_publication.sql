-- Root cause fix for: unread-messages red dot on mobile (and web) never clearing.
--
-- Diagnosis (2026-07-26): the `supabase_realtime` publication — the one Postgres uses to
-- broadcast postgres_changes events to Supabase Realtime clients — currently has ZERO
-- tables in it:
--
--   select p.pubname, count(pt.tablename)
--   from pg_publication p
--   left join pg_publication_tables pt on pt.pubname = p.pubname
--   group by p.pubname;
--   -- supabase_realtime | 0
--
-- (The other publication, supabase_realtime_messages_publication, is Supabase's internal
-- Realtime Broadcast/Presence plumbing over realtime.messages_* partitions — unrelated to
-- our app tables.)
--
-- Every client-side .channel(...).on('postgres_changes', ...) subscription in the app
-- depends on this publication. With it empty, none of those subscriptions ever fire:
--   - mobile useUnreadMessageCount / web useMainNavItems + ChatIconWithUnread: listen for
--     INSERT on messages and UPDATE on chat_participants (last_read_at) to refresh the
--     unread-messages badge. Neither ever fires, so the badge only updates once at mount
--     and then goes stale — exactly the "red dot appears, I read the messages, exit, dot
--     is still there" bug reported on 2026-07-26.
--   - Same failure mode silently affects: notifications bell/badge, live chat message
--     delivery without a manual refresh, artist/venue follow-button live sync, and
--     verification status updates.
--
-- Fix: add the tables the app actually subscribes to back to supabase_realtime.
-- This is additive and safe — it only enables broadcasting of changes on these tables;
-- it does not change RLS, data, or any app logic.
--
-- Note: src/hooks/usePromotionRealtime.ts also subscribes to a table `event_promotions`,
-- but that table does not exist in the database (checked information_schema.tables) — it's
-- dead/unshipped code, not a regression from this fix, so it's omitted here.

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.artist_follows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_venue_relationships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jambase_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_verifications;

-- Verify afterward:
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
-- Expect all 9 tables above listed.
