-- =============================================================================
-- 02 — Consolidate redundant permissive RLS policies  (Finding 3)
-- Advisor: multiple_permissive_policies
-- =============================================================================
--
-- RULE USED (provably access-preserving): when a table has multiple PERMISSIVE
--   policies for the same command, Postgres OR's them. So we either (a) drop a
--   policy that is a strict subset of another, or (b) replace N policies with one
--   whose condition is the OR of all originals. Access is identical; only the
--   per-row evaluation count drops.
--
-- KEY FACTS this relies on:
--   * The `service_role` key is BYPASSRLS — policies like
--     `auth.role() = 'service_role'` never actually gate anything, so dropping
--     them changes nothing for the backend/sync (they still bypass RLS).
--   * A `USING (true)` SELECT policy makes every other SELECT policy on that
--     table redundant.
--
-- Covers the 9 highest-traffic tables. Verify after each with the DRY RUN.
-- Apply table-by-table; each block is independent.
--
-- -----------------------------------------------------------------------------
-- DRY RUN — every remaining duplicate permissive group (run before & after)
-- -----------------------------------------------------------------------------
SELECT tablename, cmd, roles::text, count(*) AS n, string_agg(policyname,' | ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename, cmd, roles
HAVING count(*) > 1
ORDER BY count(*) DESC, tablename;

-- =============================================================================
-- device_tokens : 6 policies -> 1  (drop service_role + 4 per-command subsets)
-- =============================================================================
DROP POLICY IF EXISTS "Service role can manage device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can delete their own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can insert their own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can view their own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can update their own device tokens" ON public.device_tokens;
-- keeps: "Users can manage own device tokens" (FOR ALL, own) — already covers all 4 commands.

-- =============================================================================
-- artists : admin DELETE/UPDATE are subsets of the authenticated policies
-- =============================================================================
DROP POLICY IF EXISTS "Admins can delete all artists" ON public.artists;
DROP POLICY IF EXISTS "Admins can update all artists" ON public.artists;
-- keeps: "Artists can be deleted/updated by authenticated users" (admins ARE authenticated).

-- =============================================================================
-- venues : admin UPDATE is a subset of the authenticated UPDATE policy
-- =============================================================================
DROP POLICY IF EXISTS "Admins can update all venues" ON public.venues;
-- keeps: "Venues can be updated by authenticated users".

-- =============================================================================
-- events : SELECT has a USING(true) policy -> 3 others are redundant
-- =============================================================================
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view published events" ON public.events;
DROP POLICY IF EXISTS "Users can view their own created events" ON public.events;
-- keeps: "Events are viewable by everyone" (USING true). INSERT/UPDATE/DELETE untouched.

-- =============================================================================
-- notifications : drop redundant service_role ALL policy (BYPASSRLS)
-- =============================================================================
DROP POLICY IF EXISTS "Service role manages notifications" ON public.notifications;
-- keeps: "Users read own notifications" (SELECT), "Users update own notifications" (UPDATE).

-- =============================================================================
-- event_media : drop redundant service_role ALL policy (BYPASSRLS)
-- =============================================================================
DROP POLICY IF EXISTS "Service role can manage event media" ON public.event_media;
-- keeps: "Review owners can manage their media" (ALL), "Anyone can view public review media" (SELECT).

-- =============================================================================
-- interactions : dedupe identical INSERT; merge SELECT 2 -> 1
-- =============================================================================
DROP POLICY IF EXISTS "Users can create their own interactions" ON public.interactions;  -- identical to the insert policy kept below
DROP POLICY IF EXISTS "Admins can view all interactions" ON public.interactions;
DROP POLICY IF EXISTS "Users can view their own interactions" ON public.interactions;
DROP POLICY IF EXISTS "interactions_select" ON public.interactions;   -- idempotent: safe re-run
CREATE POLICY "interactions_select" ON public.interactions
  FOR SELECT TO public
  USING (
    (user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type)
  );
-- keeps: "Users can insert their own interactions".

-- =============================================================================
-- chat_participants : drop subset DELETE/INSERT; merge UPDATE 2 -> 1
-- =============================================================================
DROP POLICY IF EXISTS "Users can leave chats" ON public.chat_participants;   -- subset of chat_participants_delete
DROP POLICY IF EXISTS "Users can join chats"  ON public.chat_participants;   -- subset of chat_participants_insert
DROP POLICY IF EXISTS "Admins can manage participants" ON public.chat_participants;
DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
CREATE POLICY "chat_participants_update" ON public.chat_participants
  FOR UPDATE TO public
  USING (
    (user_id = (SELECT auth.uid()))
    OR is_chat_admin(chat_id)
    OR EXISTS (SELECT 1 FROM public.chat_participants cp2
               WHERE cp2.chat_id = chat_participants.chat_id
                 AND cp2.user_id = (SELECT auth.uid()) AND cp2.is_admin = true)
  );

-- =============================================================================
-- user_relationships : merge 4 SELECT policies -> 1
-- =============================================================================
DROP POLICY IF EXISTS "Admins can view all user_relationships" ON public.user_relationships;
DROP POLICY IF EXISTS "Allow view follow relationships for profile" ON public.user_relationships;
DROP POLICY IF EXISTS "Allow view friend relationships for profile" ON public.user_relationships;
DROP POLICY IF EXISTS "Users can view their own relationships" ON public.user_relationships;
DROP POLICY IF EXISTS "user_relationships_select" ON public.user_relationships;   -- idempotent: safe re-run
CREATE POLICY "user_relationships_select" ON public.user_relationships
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.uid()) = user_id)
    OR ((SELECT auth.uid()) = related_user_id)
    OR (relationship_type = 'follow')
    OR (relationship_type = 'friend' AND status = 'accepted')
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type)
  );
-- keeps: "Admins can manage all relationships" (ALL) + the own INSERT/UPDATE/DELETE policies.

-- #############################################################################
-- PART 2 — remaining tables with duplicate SELECT policies
-- #############################################################################
--
-- These are all SELECT duplicates. Where a `USING (true)` "viewable by everyone"
-- policy exists AND the other policy is only a subset (own/admin), the subset is
-- pure overhead -> drop it. Where both policies genuinely restrict, merge to one
-- with the OR of both conditions (identical access, single evaluation).

-- comments : "Comments are viewable by everyone" (true) makes admin redundant
DROP POLICY IF EXISTS "Admins can view all comments" ON public.comments;

-- engagements : same pattern
DROP POLICY IF EXISTS "Admins can view all engagements" ON public.engagements;

-- user_event_relationships : "Event relationships are viewable by everyone" (true)
DROP POLICY IF EXISTS "Admins can view all user_event_relationships" ON public.user_event_relationships;

-- user_achievement_progress : "Anyone can view ... (for leaderboards)" (true)
DROP POLICY IF EXISTS "Users can view their own achievement progress" ON public.user_achievement_progress;

-- messages : participant-scoped + admin -> merge (private data; union preserves access)
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO public
  USING (
    is_user_chat_participant(chat_id, (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type)
  );

-- missing_entity_requests : own + admin (authenticated)
DROP POLICY IF EXISTS "Admins can view all missing entity requests" ON public.missing_entity_requests;
DROP POLICY IF EXISTS "Users can view their own missing entity requests" ON public.missing_entity_requests;
DROP POLICY IF EXISTS "missing_entity_requests_select" ON public.missing_entity_requests;   -- idempotent
CREATE POLICY "missing_entity_requests_select" ON public.missing_entity_requests
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.uid()) = user_id)
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type)
  );

-- moderation_flags : own + admin (admin check includes permissions_metadata flag)
DROP POLICY IF EXISTS "Admins can view all flags" ON public.moderation_flags;
DROP POLICY IF EXISTS "Users can view their own flags" ON public.moderation_flags;
DROP POLICY IF EXISTS "moderation_flags_select" ON public.moderation_flags;   -- idempotent
CREATE POLICY "moderation_flags_select" ON public.moderation_flags
  FOR SELECT TO public
  USING (
    ((SELECT auth.uid()) = flagged_by_user_id)
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.user_id = (SELECT auth.uid())
                 AND (u.account_type = 'admin'::account_type
                      OR (u.permissions_metadata ->> 'is_admin') = 'true'))
  );

-- user_warnings : own + admin (preserve the ::text casts exactly)
DROP POLICY IF EXISTS "Admins can view all warnings" ON public.user_warnings;
DROP POLICY IF EXISTS "Users can view their own warnings" ON public.user_warnings;
DROP POLICY IF EXISTS "user_warnings_select" ON public.user_warnings;   -- idempotent
CREATE POLICY "user_warnings_select" ON public.user_warnings
  FOR SELECT TO public
  USING (
    (((SELECT auth.uid()))::text = (user_id)::text)
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE (u.user_id)::text = ((SELECT auth.uid()))::text
                 AND u.account_type = 'admin'::account_type)
  );

-- reviews : 5 SELECT policies -> 1 (OR-union preserves exact visibility).
--   NOTE: "Published reviews are viewable by everyone" = (is_draft=false OR is_draft IS NULL)
--   already makes every non-draft review public. The union keeps that behavior.
DROP POLICY IF EXISTS "Admins can view all reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Published reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can view own draft reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_select" ON public.reviews;   -- idempotent
CREATE POLICY "reviews_select" ON public.reviews
  FOR SELECT TO public
  USING (
    (is_public = true)
    OR (is_draft = false OR is_draft IS NULL)
    OR ((SELECT auth.uid()) = user_id)
    OR EXISTS (SELECT 1 FROM public.users u
               WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type)
  );

-- =============================================================================
-- users : SELECT — READ THIS, it is a behavior decision, not a mechanical merge.
-- =============================================================================
-- There are 4 SELECT policies. One is "Users are viewable by everyone" USING (true).
-- Because permissive policies are OR'd, that `true` policy OVERRIDES the other two:
--   * "Bot users hidden from client SELECT"  (meant to hide bot accounts)
--   * "Users can view all public profiles"   (meant to restrict to public profiles)
-- Right now those two do NOTHING — every user row is visible to everyone. So this
-- isn't just redundancy; the intended restrictions are already disabled in prod.
--
-- OPTION A (DEFAULT — preserves CURRENT behavior exactly: everyone sees everyone):
--   keep only the `true` policy, drop the other three. One eval instead of four.
DROP POLICY IF EXISTS "Bot users hidden from client SELECT" ON public.users;
DROP POLICY IF EXISTS "Users can view all public profiles" ON public.users;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
-- keeps: "Users are viewable by everyone" (USING true).
--
-- OPTION B (BEHAVIOR CHANGE — actually enforce bot-hiding + public-profile rules):
--   Do NOT run Option A above. Instead drop the `true` policy and keep the
--   restrictive ones. This WILL change what clients can see (bots hidden, private
--   profiles hidden from non-owners). Only do this if that's the intended product
--   behavior — test the app thoroughly (profiles, chat peers, search) first.
--   DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users;
--   (leaves the bot-hiding + public-profile + own-profile policies in force)

-- =============================================================================
-- VERIFY — re-run the DRY RUN at top; all covered tables should show far fewer
--   (mostly zero) duplicate groups. Then smoke-test in the app:
--   chat open/leave + messages, device-token registration, view a profile's
--   friends/follows, admin user list, event feed, reviews (own + others', drafts),
--   comments, notifications, post an interaction, leaderboards.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK — recreate the original policies verbatim
-- -----------------------------------------------------------------------------
-- device_tokens
-- CREATE POLICY "Service role can manage device tokens" ON public.device_tokens FOR ALL TO public
--   USING ((SELECT auth.role())='service_role') WITH CHECK ((SELECT auth.role())='service_role');
-- CREATE POLICY "Users can delete their own device tokens" ON public.device_tokens FOR DELETE TO public
--   USING ((SELECT auth.uid())=user_id);
-- CREATE POLICY "Users can insert their own device tokens" ON public.device_tokens FOR INSERT TO public
--   WITH CHECK ((SELECT auth.uid())=user_id);
-- CREATE POLICY "Users can view their own device tokens" ON public.device_tokens FOR SELECT TO public
--   USING ((SELECT auth.uid())=user_id);
-- CREATE POLICY "Users can update their own device tokens" ON public.device_tokens FOR UPDATE TO public
--   USING ((SELECT auth.uid())=user_id);
-- artists
-- CREATE POLICY "Admins can delete all artists" ON public.artists FOR DELETE TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- CREATE POLICY "Admins can update all artists" ON public.artists FOR UPDATE TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- venues
-- CREATE POLICY "Admins can update all venues" ON public.venues FOR UPDATE TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- events
-- CREATE POLICY "Admins can view all events" ON public.events FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- CREATE POLICY "Anyone can view published events" ON public.events FOR SELECT TO public
--   USING ((event_status IS NULL) OR (event_status='published') OR (created_by_user_id=(SELECT auth.uid()))
--          OR EXISTS (SELECT 1 FROM users u WHERE u.user_id=(SELECT auth.uid()) AND u.account_type = ANY (ARRAY['admin'::account_type,'creator'::account_type,'business'::account_type])));
-- CREATE POLICY "Users can view their own created events" ON public.events FOR SELECT TO public
--   USING (created_by_user_id=(SELECT auth.uid()));
-- notifications
-- CREATE POLICY "Service role manages notifications" ON public.notifications FOR ALL TO public
--   USING ((SELECT auth.role())='service_role') WITH CHECK ((SELECT auth.role())='service_role');
-- event_media
-- CREATE POLICY "Service role can manage event media" ON public.event_media FOR ALL TO public
--   USING ((SELECT auth.role())='service_role') WITH CHECK ((SELECT auth.role())='service_role');
-- interactions
-- DROP POLICY IF EXISTS "interactions_select" ON public.interactions;
-- CREATE POLICY "Users can create their own interactions" ON public.interactions FOR INSERT TO public WITH CHECK ((SELECT auth.uid())=user_id);
-- CREATE POLICY "Admins can view all interactions" ON public.interactions FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- CREATE POLICY "Users can view their own interactions" ON public.interactions FOR SELECT TO public USING (user_id=(SELECT auth.uid()));
-- chat_participants
-- DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
-- CREATE POLICY "Users can leave chats" ON public.chat_participants FOR DELETE TO public USING (user_id=(SELECT auth.uid()));
-- CREATE POLICY "Users can join chats" ON public.chat_participants FOR INSERT TO public WITH CHECK (user_id=(SELECT auth.uid()));
-- CREATE POLICY "Admins can manage participants" ON public.chat_participants FOR UPDATE TO public
--   USING (EXISTS (SELECT 1 FROM chat_participants cp2 WHERE cp2.chat_id=chat_participants.chat_id AND cp2.user_id=(SELECT auth.uid()) AND cp2.is_admin=true));
-- CREATE POLICY "chat_participants_update" ON public.chat_participants FOR UPDATE TO public
--   USING ((user_id=(SELECT auth.uid())) OR is_chat_admin(chat_id));
-- user_relationships
-- DROP POLICY IF EXISTS "user_relationships_select" ON public.user_relationships;
-- CREATE POLICY "Admins can view all user_relationships" ON public.user_relationships FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- CREATE POLICY "Allow view follow relationships for profile" ON public.user_relationships FOR SELECT TO authenticated USING (relationship_type='follow');
-- CREATE POLICY "Allow view friend relationships for profile" ON public.user_relationships FOR SELECT TO authenticated USING (relationship_type='friend' AND status='accepted');
-- CREATE POLICY "Users can view their own relationships" ON public.user_relationships FOR SELECT TO public
--   USING (((SELECT auth.uid())=user_id) OR ((SELECT auth.uid())=related_user_id));
-- ---- PART 2 rollbacks ----
-- comments
-- CREATE POLICY "Admins can view all comments" ON public.comments FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- engagements
-- CREATE POLICY "Admins can view all engagements" ON public.engagements FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- user_event_relationships
-- CREATE POLICY "Admins can view all user_event_relationships" ON public.user_event_relationships FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- user_achievement_progress
-- CREATE POLICY "Users can view their own achievement progress" ON public.user_achievement_progress FOR SELECT TO public
--   USING ((SELECT auth.uid())=user_id);
-- messages
-- DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
-- CREATE POLICY "Admins can view all messages" ON public.messages FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- CREATE POLICY "messages_select_policy" ON public.messages FOR SELECT TO public
--   USING (is_user_chat_participant(chat_id, (SELECT auth.uid())));
-- missing_entity_requests
-- DROP POLICY IF EXISTS "missing_entity_requests_select" ON public.missing_entity_requests;
-- CREATE POLICY "Admins can view all missing entity requests" ON public.missing_entity_requests FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- CREATE POLICY "Users can view their own missing entity requests" ON public.missing_entity_requests FOR SELECT TO authenticated
--   USING ((SELECT auth.uid())=user_id);
-- moderation_flags
-- DROP POLICY IF EXISTS "moderation_flags_select" ON public.moderation_flags;
-- CREATE POLICY "Admins can view all flags" ON public.moderation_flags FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND (users.account_type='admin'::account_type OR (users.permissions_metadata->>'is_admin')='true')));
-- CREATE POLICY "Users can view their own flags" ON public.moderation_flags FOR SELECT TO public
--   USING ((SELECT auth.uid())=flagged_by_user_id);
-- user_warnings
-- DROP POLICY IF EXISTS "user_warnings_select" ON public.user_warnings;
-- CREATE POLICY "Admins can view all warnings" ON public.user_warnings FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE (users.user_id)::text=((SELECT auth.uid()))::text AND users.account_type='admin'::account_type));
-- CREATE POLICY "Users can view their own warnings" ON public.user_warnings FOR SELECT TO public
--   USING (((SELECT auth.uid()))::text=(user_id)::text);
-- reviews
-- DROP POLICY IF EXISTS "reviews_select" ON public.reviews;
-- CREATE POLICY "Admins can view all reviews" ON public.reviews FOR SELECT TO public
--   USING (EXISTS (SELECT 1 FROM users WHERE users.user_id=(SELECT auth.uid()) AND users.account_type='admin'::account_type));
-- CREATE POLICY "Public reviews are viewable by everyone" ON public.reviews FOR SELECT TO public USING (is_public=true);
-- CREATE POLICY "Published reviews are viewable by everyone" ON public.reviews FOR SELECT TO public USING (is_draft=false OR is_draft IS NULL);
-- CREATE POLICY "Users can view their own reviews" ON public.reviews FOR SELECT TO public USING ((SELECT auth.uid())=user_id);
-- CREATE POLICY "Users can view own draft reviews" ON public.reviews FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
-- users (Option A rollback)
-- CREATE POLICY "Bot users hidden from client SELECT" ON public.users FOR SELECT TO anon, authenticated
--   USING ((COALESCE(is_bot,false)=false) OR (((SELECT auth.uid()) IS NOT NULL) AND EXISTS (
--     SELECT 1 FROM chat_participants cp_self JOIN chat_participants cp_peer
--       ON (cp_peer.chat_id=cp_self.chat_id AND cp_peer.user_id=users.user_id)
--     WHERE cp_self.user_id=(SELECT auth.uid()))));
-- CREATE POLICY "Users can view all public profiles" ON public.users FOR SELECT TO public
--   USING ((is_public_profile=true) OR ((SELECT auth.uid())=user_id));
-- CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT TO public USING ((SELECT auth.uid())=user_id);
