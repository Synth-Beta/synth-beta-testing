-- ============================================================
-- User cluster affinity: (user, cluster_path_slug, country) with score
-- Derived from user_event_relationships (going/maybe) + event_clusters.
-- Refresh via refresh_user_cluster_affinity(); run periodically or after taxonomy rebuild.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_cluster_affinity (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_path_slug TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  score NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cluster_path_slug, country)
);

CREATE INDEX IF NOT EXISTS idx_user_cluster_affinity_user ON public.user_cluster_affinity (user_id);
CREATE INDEX IF NOT EXISTS idx_user_cluster_affinity_cluster_country ON public.user_cluster_affinity (cluster_path_slug, country);

COMMENT ON TABLE public.user_cluster_affinity IS
  'Per-user affinity for (cluster_path_slug, country) from event interests. Used for feed cluster scoring. Refresh with refresh_user_cluster_affinity().';

-- Populate from user_event_relationships (going/maybe) + event_clusters
CREATE OR REPLACE FUNCTION public.refresh_user_cluster_affinity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_cluster_affinity;

  INSERT INTO public.user_cluster_affinity (user_id, cluster_path_slug, country, score, updated_at)
  SELECT
    uer.user_id,
    ec.cluster_path_slug,
    COALESCE(trim(ec.country), ''),
    count(*)::NUMERIC AS score,
    now() AS updated_at
  FROM public.user_event_relationships uer
  JOIN public.event_clusters ec ON ec.event_id = uer.event_id
  WHERE uer.relationship_type IN ('going', 'maybe')
  GROUP BY uer.user_id, ec.cluster_path_slug, COALESCE(trim(ec.country), '');
END;
$$;

ALTER TABLE public.user_cluster_affinity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own cluster affinity"
  ON public.user_cluster_affinity FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.user_cluster_affinity TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_cluster_affinity() TO authenticated;

COMMENT ON FUNCTION public.refresh_user_cluster_affinity IS
  'Repopulate user_cluster_affinity from user_event_relationships + event_clusters. Run after taxonomy/path rebuild or periodically.';
