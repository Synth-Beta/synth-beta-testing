-- Force-update gate: the app reads ios_min_version on launch and blocks with an
-- "Update required" screen when its installed version is lower. Raise the value in the
-- Supabase table editor AFTER the new build is live in the App Store.
-- Readable by anon so the gate works before sign-in. Writes: service role only.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.app_config;

CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config readable by everyone" ON public.app_config;
CREATE POLICY "app_config readable by everyone"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.app_config (key, value) VALUES ('ios_min_version', '1.4.4')
ON CONFLICT (key) DO NOTHING;
