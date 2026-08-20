-- Cleanup follow-up to 20260819120000_fix_spotify_user_tokens_rls.sql.
--
-- After applying that migration, `spotify_user_tokens` had FOUR policies instead of one:
--   Users can delete own spotify token   DELETE  {public}
--   Users can insert own spotify token   INSERT  {public}
--   Users can manage own spotify tokens  ALL     {authenticated}   <- added by the prior migration
--   Users can update own spotify token   UPDATE  {public}
--
-- The three `{public}`-role policies predate the prior migration and were never created by
-- any tracked migration - they were live in the DB but apparently broken (Postgres throws the
-- identical "new row violates row-level security policy" error both when a policy is missing
-- AND when one exists but its USING/WITH CHECK evaluates false, so their exact defect was
-- never diagnosed - it didn't need to be, since the new ALL/authenticated policy is enough on
-- its own). Run this in the Supabase SQL editor to drop the three redundant/unexplained
-- policies and keep just the one correct one, so a future session isn't debugging phantom
-- policies again.

DROP POLICY IF EXISTS "Users can delete own spotify token" ON public.spotify_user_tokens;
DROP POLICY IF EXISTS "Users can insert own spotify token" ON public.spotify_user_tokens;
DROP POLICY IF EXISTS "Users can update own spotify token" ON public.spotify_user_tokens;
-- keeps: "Users can manage own spotify tokens" (FOR ALL, authenticated, own row) - already covers all 4 commands.

-- Confirm only one policy remains:
-- SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spotify_user_tokens';
