-- SEO MVP extras: faster DC page queries, genre page counts, and public interest counts.

-- The city page and seo_page_candidates() look up upcoming events by venue.
CREATE INDEX IF NOT EXISTS events_venue_id_event_date_idx ON public.events (venue_id, event_date);

-- Upcoming DC shows per genre, keyed by the same slug the genre page URLs use
-- (api/_lib/seo/render.ts slugifyGenre mirrors seo_slugify). Data is already public.
CREATE OR REPLACE FUNCTION public.seo_genre_counts()
RETURNS TABLE (genre_slug text, upcoming_events integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.seo_slugify(g.genre) AS genre_slug, count(DISTINCT e.id)::integer
  FROM public.events e
  JOIN public.venues v ON v.id = e.venue_id
  CROSS JOIN LATERAL unnest(e.genres) AS g(genre)
  WHERE v.city ILIKE 'washington' AND v.state = 'District of Columbia'
    AND e.event_date >= now()
    AND coalesce(e.event_status, 'scheduled') <> 'cancelled'
    AND public.seo_slugify(g.genre) IS NOT NULL
  GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION public.seo_genre_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_genre_counts() TO anon, authenticated, service_role;

-- "N interested on Synth" for public pages: counts only, never who. SECURITY DEFINER so
-- it keeps working if user_event_relationships RLS is tightened to hide rows from anon.
CREATE OR REPLACE FUNCTION public.seo_event_interest_counts(p_event_ids uuid[])
RETURNS TABLE (event_id uuid, interested integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.event_id, count(DISTINCT r.user_id)::integer
  FROM public.user_event_relationships r
  WHERE r.event_id = ANY (p_event_ids[1:1000])
    AND r.relationship_type IN ('interested', 'going')
  GROUP BY r.event_id;
$$;

REVOKE ALL ON FUNCTION public.seo_event_interest_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_event_interest_counts(uuid[]) TO anon, authenticated, service_role;
