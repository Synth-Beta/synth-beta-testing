CREATE TABLE IF NOT EXISTS public.social_media_follower_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('TikTok', 'Instagram', 'Facebook')),
  snapshot_date DATE NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_social_media_follower_snapshots_platform_date
  ON public.social_media_follower_snapshots (platform, snapshot_date DESC);

ALTER TABLE public.social_media_follower_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage social media follower snapshots"
  ON public.social_media_follower_snapshots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
