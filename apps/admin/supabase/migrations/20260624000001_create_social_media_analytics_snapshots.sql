CREATE TABLE IF NOT EXISTS public.social_media_analytics_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('Instagram', 'Facebook', 'TikTok')),
  payload JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_media_analytics_snapshots_platform_captured
ON public.social_media_analytics_snapshots(platform, captured_at DESC);

ALTER TABLE public.social_media_analytics_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_media_analytics_snapshots'
      AND policyname = 'Service role can manage social analytics snapshots'
  ) THEN
    CREATE POLICY "Service role can manage social analytics snapshots"
    ON public.social_media_analytics_snapshots
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
