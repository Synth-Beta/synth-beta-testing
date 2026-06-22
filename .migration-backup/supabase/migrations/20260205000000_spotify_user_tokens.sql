-- ============================================================
-- Store Spotify refresh tokens for server-side sync (backfill)
-- ============================================================
-- When a user connects Spotify, the app saves their refresh_token here.
-- A server-side script can then sync their data to streaming_profiles
-- without the user opening the app.
--
-- Security: Authenticated users can only INSERT/UPDATE their own row.
-- SELECT is denied for authenticated/anon so tokens never go to the client.
-- Only service_role can SELECT (for the backfill script).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.spotify_user_tokens (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can write their own token, but never read it back (prevents token leakage)
ALTER TABLE public.spotify_user_tokens ENABLE ROW LEVEL SECURITY;

-- Allow user to insert their own row (on first connect)
CREATE POLICY "Users can insert own spotify token"
ON public.spotify_user_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow user to update their own row (on reconnect)
CREATE POLICY "Users can update own spotify token"
ON public.spotify_user_tokens
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow user to delete their own row (on disconnect)
CREATE POLICY "Users can delete own spotify token"
ON public.spotify_user_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- No SELECT policy for authenticated/anon: client never reads tokens
-- service_role bypasses RLS and can SELECT for backfill script

GRANT INSERT, UPDATE, DELETE ON public.spotify_user_tokens TO authenticated;
GRANT ALL ON public.spotify_user_tokens TO service_role;

COMMENT ON TABLE public.spotify_user_tokens IS 'Stores Spotify refresh tokens for server-side sync. Client can only write; only service_role can read.';
