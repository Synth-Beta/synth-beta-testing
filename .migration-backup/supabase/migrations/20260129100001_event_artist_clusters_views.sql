-- ============================================================
-- Event and artist cluster views (genre cluster + country for events)
-- For feed scoring and "similar artists/events". Option A: views, no tables.
-- Requires: genre_cluster_keys, events_genres, artists_genres, venues.country
-- ============================================================

-- Event clusters: (event_id, cluster_path_slug, country)
-- Events can appear in multiple clusters (multiple genres). Country from venue.
CREATE OR REPLACE VIEW public.event_clusters AS
SELECT DISTINCT
  e.id AS event_id,
  ck.cluster_path_slug,
  trim(v.country) AS country
FROM public.events e
JOIN public.events_genres eg ON eg.event_id = e.id
JOIN public.genre_cluster_keys ck ON ck.genre_id = eg.genre_id
LEFT JOIN public.venues v ON v.id = e.venue_id;

COMMENT ON VIEW public.event_clusters IS
  'Event cluster membership by genre cluster and venue country. One row per (event, cluster_path_slug, country). Used for feed scoring and analytics.';

GRANT SELECT ON public.event_clusters TO authenticated;

-- Artist clusters: (artist_id, cluster_path_slug)
-- Artists can appear in multiple clusters. Country for artists deferred (e.g. from events later).
CREATE OR REPLACE VIEW public.artist_clusters AS
SELECT DISTINCT
  a.id AS artist_id,
  ck.cluster_path_slug
FROM public.artists a
JOIN public.artists_genres ag ON ag.artist_id = a.id
JOIN public.genre_cluster_keys ck ON ck.genre_id = ag.genre_id;

COMMENT ON VIEW public.artist_clusters IS
  'Artist cluster membership by genre cluster. One row per (artist, cluster_path_slug). Used for similar-artists and analytics.';

GRANT SELECT ON public.artist_clusters TO authenticated;
