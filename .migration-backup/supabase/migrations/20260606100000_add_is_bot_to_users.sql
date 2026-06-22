-- Add is_bot flag for bot seed accounts (exclude from analytics)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_bot ON public.users(is_bot) WHERE is_bot = true;

COMMENT ON COLUMN public.users.is_bot IS
  'Bot seed accounts. Exclude from DAU/MAU: WHERE COALESCE(is_bot, false) = false';

CREATE OR REPLACE VIEW public.analytics_users AS
  SELECT * FROM public.users WHERE COALESCE(is_bot, false) = false;

COMMENT ON VIEW public.analytics_users IS
  'Real users only — use for DAU/MAU and engagement metrics';
