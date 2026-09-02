-- =============================================================================
-- 09 — Remaining #20 items from the 07 results: write policies + leftover tables
-- Lower priority than 08. Read the notes; two of these are product decisions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. scene_participants — any logged-in user can modify anyone's membership.
--
--   From 07 section B:
--     scene_participants | Authenticated users can modify scene participants | ALL
--       USING       (auth.role() = 'authenticated')
--       WITH CHECK  (auth.role() = 'authenticated')
--   plus, from section C:
--     scene_participants | Anyone can view scene participants | SELECT | qual true
--
--   `ALL` covers INSERT, UPDATE and DELETE, and the condition only asks "are you
--   logged in", never "is this your row". So any of your 121 users can add
--   themselves to any scene, remove anyone else from any scene, or wipe the table.
--   This is the widest write grant in the schema.
--
--   DRY RUN — see the current shape and how much data is at stake:
-- -----------------------------------------------------------------------------
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'scene_participants';

SELECT count(*) AS rows, count(DISTINCT user_id) AS distinct_users
FROM public.scene_participants;

-- APPLY — replace the blanket policy with ownership-scoped writes. Reading stays
--   public (the leaderboard/scene pages rely on it).
--   Review the column names against your schema first: this assumes user_id.
-- DROP POLICY IF EXISTS "Authenticated users can modify scene participants" ON public.scene_participants;
--
-- CREATE POLICY "Users can join scenes as themselves"
--   ON public.scene_participants FOR INSERT TO authenticated
--   WITH CHECK ((SELECT auth.uid()) = user_id);
--
-- CREATE POLICY "Users can update their own scene participation"
--   ON public.scene_participants FOR UPDATE TO authenticated
--   USING ((SELECT auth.uid()) = user_id)
--   WITH CHECK ((SELECT auth.uid()) = user_id);
--
-- CREATE POLICY "Users can leave scenes they joined"
--   ON public.scene_participants FOR DELETE TO authenticated
--   USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- B. artists / venues — any logged-in user can edit or delete catalogue rows.
--
--   From 07 section D:
--     artists | Artists can be deleted by authenticated users | DELETE | auth.role() = 'authenticated'
--     artists | Artists can be updated by authenticated users | UPDATE | auth.role() = 'authenticated'
--     venues  | Venues can be updated by authenticated users  | UPDATE | auth.role() = 'authenticated'
--
--   These are integrity rather than disclosure risks, but the blast radius is
--   large: artists and venues are referenced by events, events_genres and the feed
--   personalization pipeline. One user renaming or deleting rows corrupts other
--   people's feeds, and the venue dedup work from 2026-07-12 assumed these rows
--   are stable.
--
--   NOTE this is a product decision, not a pure bug — you may have intended
--   user-contributed catalogue edits. If so, the safer shape is: users may edit
--   rows they created (there is already a separate user_created_artists table for
--   exactly this), and everything else is service-role/admin only.
--
--   DRY RUN — how much of the catalogue is user-created vs synced?
-- -----------------------------------------------------------------------------
SELECT count(*) AS total_artists FROM public.artists;
SELECT count(*) AS user_created FROM public.user_created_artists;

-- APPLY — admin-or-creator only, matching how `events` already gates writes.
-- DROP POLICY IF EXISTS "Artists can be deleted by authenticated users" ON public.artists;
-- DROP POLICY IF EXISTS "Artists can be updated by authenticated users" ON public.artists;
--
-- CREATE POLICY "Admins can update artists"
--   ON public.artists FOR UPDATE TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.users u
--                  WHERE u.user_id = (SELECT auth.uid())
--                    AND u.account_type = 'admin'::account_type));
--
-- CREATE POLICY "Admins can delete artists"
--   ON public.artists FOR DELETE TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.users u
--                  WHERE u.user_id = (SELECT auth.uid())
--                    AND u.account_type = 'admin'::account_type));
--
-- Same shape for venues UPDATE if you want it locked down too.

-- -----------------------------------------------------------------------------
-- C. user_event_relationships is world-readable — flagging, not fixing.
--
--     user_event_relationships | Event relationships are viewable by everyone | SELECT | true
--
--   That is who is interested in / going to which event, readable logged-out. For
--   a social concert app this is plausibly the intended product behaviour, and the
--   Interested/Going feature depends on reading other people's rows. Raising it
--   only so the choice is explicit: an anonymous visitor can currently build an
--   attendance history for any named user. If that is intended, no action.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- D. Leftover work tables — drop them.
--
--   All are RLS-on/fail-closed per 07 section A, so none is exposed today. The
--   reason to drop them anyway: users_backup_20260715 is a full copy of your users
--   table, PII included, and it carries an anon SELECT grant. It is fail-closed
--   ONLY because RLS is enabled with zero policies. One `ALTER TABLE ... DISABLE
--   ROW LEVEL SECURITY` — or one policy added by mistake — turns it into the
--   exposure in file 08, with none of the column protections.
--
--   Your notes already list most of these as droppable. events_dedup_backup is
--   deliberately kept as an audit trail.
--
--   DRY RUN — confirm sizes and that you recognise each one:
-- -----------------------------------------------------------------------------
SELECT c.relname AS table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=c.relname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname IN (
    'users_backup_20260715', '_venue_canon', '_venue_canon_unique',
    'venue_dedup_map', 'event_dedup_map', '_genre_cooc_stg',
    '_device_token_dedup_2026_08_02_backup', 'genre_merge_map_20260820',
    'genre_placeholder_backup_20260820'
  )
ORDER BY pg_total_relation_size(c.oid) DESC;

-- APPLY — highest value first. Run individually, not as one paste.
-- DROP TABLE IF EXISTS public.users_backup_20260715;          -- PII copy, drop first
-- DROP TABLE IF EXISTS public._venue_canon;
-- DROP TABLE IF EXISTS public._venue_canon_unique;
-- DROP TABLE IF EXISTS public.venue_dedup_map;
-- DROP TABLE IF EXISTS public.event_dedup_map;
-- DROP TABLE IF EXISTS public._genre_cooc_stg;
-- DROP TABLE IF EXISTS public._device_token_dedup_2026_08_02_backup;
-- DROP TABLE IF EXISTS public.genre_merge_map_20260820;
-- DROP TABLE IF EXISTS public.genre_placeholder_backup_20260820;
-- KEEP: events_dedup_backup (audit trail for the 2026-07-17 event dedup)

-- -----------------------------------------------------------------------------
-- E. What came back CLEAN in 07 — recorded so it is not re-audited later.
--
--   Section A: all 30 tables rls_enabled = true. web_session_bridge and
--     users_backup_20260715 are fail-closed, NOT exposed.
--   Section B: every user-data INSERT policy checks auth.uid() = user_id
--     (bucket_list, comments, engagements, reviews, messages, passport_*,
--     user_settings, user_relationships, interactions, device_tokens,
--     streaming_profiles, moderation_flags). newsletter_send_jobs and
--     newsletter_unsubscribes are WITH CHECK false — deliberately insert-proof.
--     entities is ALL false. events requires creator/admin/business AND ownership.
--     messages requires sender_id = uid AND chat participation.
--   Section C: the remaining world-readable tables are catalogue/reference data
--     (achievements, genres and the genre_* taxonomy, city_centers, content_*,
--     entities, events, events_genres, external_entity_ids, news_items, venues,
--     artists, artists_genres, jambase_events) — appropriate to be public.
-- -----------------------------------------------------------------------------
