-- Partner account connections (Pick Five first). Each app keeps its own accounts and its
-- own Auth; a connection only associates a Synth user with a partner user. Neither app
-- ever signs anyone into the other.
--
-- Flow (both apps implement the same endpoints, see api/_lib/auth/partnerLink.ts):
--   1. A signed-in user asks the app they're in for a one-time code (10 min, single use).
--   2. They enter / open it in the other app while signed in there.
--   3. That app's server redeems the code with the issuing app (partner key) and both
--      store the link plus a shared link_token, hashed here, used for later data calls.

CREATE TABLE IF NOT EXISTS public.partners (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL,
  -- Base URL of the partner's /partner/link/* endpoints; null until they're live.
  api_base_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.partners (id, name) VALUES ('pickfive', 'Pick Five') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read partners" ON public.partners;
CREATE POLICY "Signed-in users can read partners"
  ON public.partners FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.partner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id text NOT NULL REFERENCES public.partners (id),
  synth_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  partner_user_id text NOT NULL,
  link_token_hash text NOT NULL UNIQUE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- One live connection per Synth user per partner, and per partner user.
CREATE UNIQUE INDEX IF NOT EXISTS partner_links_active_synth_user
  ON public.partner_links (partner_id, synth_user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partner_links_active_partner_user
  ON public.partner_links (partner_id, partner_user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.partner_links ENABLE ROW LEVEL SECURITY;
-- No policies: written and read only by the server (service role). Users see their
-- connections through public.user_connections, which leaves out the token hash.

CREATE TABLE IF NOT EXISTS public.partner_link_codes (
  code_hash text PRIMARY KEY,
  partner_id text NOT NULL REFERENCES public.partners (id),
  synth_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_link_codes_user_idx ON public.partner_link_codes (synth_user_id);

ALTER TABLE public.partner_link_codes ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- Everything a user has connected, in one place: streaming services and partner apps.
-- Reads the user's own rows via the caller's RLS (security_invoker).
CREATE OR REPLACE FUNCTION public.user_partner_connections()
RETURNS TABLE (user_id uuid, service text, connected_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- partner_links has no user-facing RLS (it holds token hashes), so expose only the
  -- caller's own active rows, without the hash.
  SELECT l.synth_user_id, l.partner_id, l.linked_at
  FROM public.partner_links l
  WHERE l.synth_user_id = (SELECT auth.uid())
    AND l.revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.user_partner_connections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_partner_connections() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.user_connections
WITH (security_invoker = true) AS
  SELECT sp.user_id, sp.service_type AS service, sp.created_at AS connected_at
  FROM public.streaming_profiles sp
  UNION ALL
  SELECT c.user_id, c.service, c.connected_at
  FROM public.user_partner_connections() c;

REVOKE ALL ON public.user_connections FROM anon;
GRANT SELECT ON public.user_connections TO authenticated;
