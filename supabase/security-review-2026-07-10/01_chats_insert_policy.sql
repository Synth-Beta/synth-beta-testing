-- =============================================================================
-- 01 — Tighten the chats INSERT policy
-- Advisor: rls_policy_always_true  (chats_insert_policy uses WITH CHECK (true))
-- =============================================================================
--
-- WHY THIS IS SAFE (verified 2026-07-10):
--   Every chat in the app is created through SECURITY DEFINER RPCs:
--     create_direct_chat, create_group_chat,
--     get_or_create_verified_chat, get_or_create_genre_chat
--   SECURITY DEFINER functions run as the function owner and BYPASS RLS, so the
--   client-facing INSERT policy does not affect them. A codebase search found NO
--   direct `.from('chats').insert(...)` calls anywhere in src/ or mobile/src/.
--   Therefore restricting this policy blocks only hand-crafted PostgREST inserts
--   made with a leaked/again anon or user token — an abuse path, not a feature.
--
-- CURRENT STATE:
--   chats_insert_policy  INSERT  role public  WITH CHECK (true)
--
-- -----------------------------------------------------------------------------
-- DRY RUN — see the policy you are about to change
-- -----------------------------------------------------------------------------
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'chats';

-- -----------------------------------------------------------------------------
-- OPTION A (RECOMMENDED, guaranteed non-breaking): require an authenticated user.
--   Blocks anonymous direct inserts. Any (non-existent today) authenticated
--   direct insert would still succeed, so this cannot break current behavior.
-- -----------------------------------------------------------------------------
ALTER POLICY chats_insert_policy ON public.chats
  WITH CHECK (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- OPTION B (STRICTER): forbid ALL direct client inserts. Chat creation still
--   works because it only happens via SECURITY DEFINER RPCs (which bypass RLS).
--   Use this if you want the client to never be able to insert chat rows directly.
--   To use Option B instead of A, comment out Option A above and uncomment this:
--
-- ALTER POLICY chats_insert_policy ON public.chats
--   WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- VERIFY after applying
-- -----------------------------------------------------------------------------
-- 1) In the app: open an existing chat and send a message  -> should work
-- 2) In the app: start a brand-new direct message           -> should work
-- 3) In the app: open/create a genre or venue/artist chat    -> should work
--    (all of these go through the RPCs above)

-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- ALTER POLICY chats_insert_policy ON public.chats WITH CHECK (true);
