-- ============================================================
-- Analytics rollups by genre cluster (umbrella_slug / cluster_path_slug, country)
-- For dashboards: event counts and artist counts by cluster.
-- Requires: genre_cluster_keys, events_genres, artists_genres, venues
-- ============================================================

-- Event counts by cluster_path_slug and country
CREATE OR REPLACE VIEW public.analytics_events_by_cluster AS
SELECT
  ck.cluster_path_slug,
  trim(v.country) AS country,
  count(DISTINCT eg.event_id)::bigint AS event_count
FROM public.events_genres eg
JOIN public.genre_cluster_keys ck ON ck.genre_id = eg.genre_id
JOIN public.events e ON e.id = eg.event_id
LEFT JOIN public.venues v ON v.id = e.venue_id
GROUP BY ck.cluster_path_slug, trim(v.country);

COMMENT ON VIEW public.analytics_events_by_cluster IS
  'Event counts by genre cluster and venue country. For dashboards and partner rollups.';

GRANT SELECT ON public.analytics_events_by_cluster TO authenticated;

-- Event counts by umbrella_slug only (coarser rollup)
CREATE OR REPLACE VIEW public.analytics_events_by_umbrella AS
SELECT
  ck.umbrella_slug,
  count(DISTINCT eg.event_id)::bigint AS event_count
FROM public.events_genres eg
JOIN public.genre_cluster_keys ck ON ck.genre_id = eg.genre_id
GROUP BY ck.umbrella_slug;

COMMENT ON VIEW public.analytics_events_by_umbrella IS
  'Event counts by umbrella genre (e.g. rock, electronic). For dashboards.';

GRANT SELECT ON public.analytics_events_by_umbrella TO authenticated;

-- Artist counts by cluster_path_slug
CREATE OR REPLACE VIEW public.analytics_artists_by_cluster AS
SELECT
  ck.cluster_path_slug,
  count(DISTINCT ag.artist_id)::bigint AS artist_count
FROM public.artists_genres ag
JOIN public.genre_cluster_keys ck ON ck.genre_id = ag.genre_id
GROUP BY ck.cluster_path_slug;

COMMENT ON VIEW public.analytics_artists_by_cluster IS
  'Artist counts by genre cluster. For dashboards.';

GRANT SELECT ON public.analytics_artists_by_cluster TO authenticated;
