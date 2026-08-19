-- Fix "new row violates row-level security policy for table spotify_user_tokens".
--
-- Root cause: spotify_user_tokens has RLS enabled but was never given any
-- policies via a tracked migration (no CREATE POLICY for this table exists
-- anywhere in supabase/migrations/, it's absent from the RLS audit in
-- supabase/perf-review-2026-07-12/02_consolidate_rls_policies.sql, and it
-- doesn't appear in the generated Supabase types) - it was created directly
-- in the Studio table editor with RLS left on and no policies added. With
-- zero policies, Postgres denies every operation for non-service-role
-- callers, including a user writing their own row.
--
-- This only breaks the CLIENT-side write paths, which upsert/delete as the
-- signed-in user via the anon-key client:
--   mobile/src/services/spotifyAuthService.ts persistRefreshToken() (upsert)
--   src/services/spotifyService.ts persistRefreshTokenForBackfill() (upsert)
--   src/services/streamingSyncActions.ts disconnectStreamingAccount() (delete)
--   mobile/src/services/streamingSyncActions.ts (delete)
-- api/spotify/sync-profile.ts is unaffected - it reads via the service role
-- key, which bypasses RLS entirely.
--
-- Run this in the Supabase SQL editor.

-- Optional: confirm the gap before applying the fix below.
-- SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spotify_user_tokens';

ALTER TABLE public.spotify_user_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own spotify tokens" ON public.spotify_user_tokens;
CREATE POLICY "Users can manage own spotify tokens" ON public.spotify_user_tokens
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
