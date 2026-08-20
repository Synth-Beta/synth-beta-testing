-- Backs the one-time session-bridge code exchange used by api/auth/bridge-session.ts and
-- api/auth/redeem-session.ts, so the mobile app's "Reconnect on web" / "Connect on web"
-- links carry an opaque single-use code instead of the actual Supabase access/refresh
-- token in the URL (a background security review flagged the token-in-URL approach as a
-- credential-exposure risk via browser history / analytics that log window.location.href).
--
-- RLS is enabled with ZERO policies, intentionally: only the service_role key (which
-- bypasses RLS) can read or write this table. No anon/authenticated policy is ever
-- needed here — both API routes already run server-side with the service role key, and
-- the whole point is that no client ever gets direct table access to anyone's tokens.
--
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.web_session_bridge (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.web_session_bridge IS
  'One-time codes bridging a native app session to the web reconnect page. Rows are deleted on redemption (see api/auth/redeem-session.ts); short-lived (2 min TTL) if never redeemed. Service-role only — RLS enabled, no policies.';

ALTER TABLE public.web_session_bridge ENABLE ROW LEVEL SECURITY;

-- Expired-but-never-redeemed rows accumulate at a low, predictable rate (one per
-- reconnect-link open); this index keeps a future manual/cron cleanup cheap if it's
-- ever needed, without requiring one now.
CREATE INDEX IF NOT EXISTS web_session_bridge_expires_at_idx ON public.web_session_bridge (expires_at);
