-- Fix get_weekly_featured_set read model: events has no artist_name / venue_name / poster_image_url.
-- Join artists + venues (LOI-601). Safe to re-run after 20260825130000.

CREATE OR REPLACE FUNCTION public.get_weekly_featured_set(
  p_metro text DEFAULT 'dc',
  p_week_id text DEFAULT NULL
)
RETURNS TABLE (
  set_id uuid,
  week_id text,
  week_start_date date,
  metro text,
  status text,
  target_count int,
  published_at timestamptz,
  updated_at timestamptz,
  item_id uuid,
  event_id uuid,
  position int,
  genre text,
  curator_note text,
  chat_provision_key text,
  event_title text,
  artist_name text,
  venue_name text,
  venue_city text,
  event_date timestamptz,
  image_url text,
  event_genres text[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH chosen AS (
    SELECT s.*
    FROM public.weekly_featured_sets s
    WHERE s.metro = p_metro
      AND s.status = 'published'
      AND (
        (p_week_id IS NOT NULL AND s.week_id = p_week_id)
        OR (p_week_id IS NULL AND s.week_id = public.dc_week_id(now()))
      )
    ORDER BY s.week_start_date DESC
    LIMIT 1
  )
  SELECT
    c.id AS set_id,
    c.week_id,
    c.week_start_date,
    c.metro,
    c.status,
    c.target_count,
    c.published_at,
    c.updated_at,
    i.id AS item_id,
    i.event_id,
    i.position,
    i.genre,
    i.curator_note,
    ('featured_show:' || c.week_id || ':' || i.event_id::text) AS chat_provision_key,
    e.title AS event_title,
    a.name AS artist_name,
    v.name AS venue_name,
    COALESCE(e.venue_city, v.city) AS venue_city,
    e.event_date,
    COALESCE(
      NULLIF(e.event_media_url, ''),
      a.image_url,
      v.image_url
    ) AS image_url,
    e.genres AS event_genres
  FROM chosen c
  JOIN public.weekly_featured_items i ON i.set_id = c.id
  JOIN public.events e ON e.id = i.event_id
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  ORDER BY i.position ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_featured_set(text, text) TO anon, authenticated, service_role;
GRANT SELECT ON public.weekly_featured_sets TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_featured_sets TO authenticated, service_role;
GRANT SELECT ON public.weekly_featured_items TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_featured_items TO authenticated, service_role;
