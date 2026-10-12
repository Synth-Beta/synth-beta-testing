-- SEO growth engine: event page slugs, search-intent targets and AI-drafted pages with an
-- approval queue, first-party visitor tracking, Search Console / Bing data, AI-assistant
-- mention tracking, and one admin dashboard RPC that aggregates all of it server-side.
-- Builds on 20261010120000_seo_engine_mvp.sql (seo_slugify, seo_settings, crawler hits).

-- ── Admin check ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seo_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.seo_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_is_admin() TO authenticated, service_role;

-- ── Event slugs ──────────────────────────────────────────────────────────────
-- /events/{artist}-{venue}-{yyyy-mm-dd}. Same rules as venue/artist slugs: set once on
-- insert, never rewritten, collisions get an id suffix.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS events_slug_key ON public.events (slug) WHERE slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.seo_event_slug_base(
  p_artist_id uuid,
  p_venue_id uuid,
  p_title text,
  p_event_date timestamptz,
  p_tz text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.seo_slugify(concat_ws(' ',
    coalesce((SELECT a.name FROM public.artists a WHERE a.id = p_artist_id), p_title),
    (SELECT v.name FROM public.venues v WHERE v.id = p_venue_id),
    to_char(p_event_date AT TIME ZONE coalesce(p_tz, 'America/New_York'), 'YYYY-MM-DD')
  ));
$$;

-- A slug problem (bad timezone name, odd data) must never fail a JamBase sync insert.
CREATE OR REPLACE FUNCTION public.seo_assign_event_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_base text;
BEGIN
  IF NEW.slug IS NOT NULL OR NEW.event_date IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_base := public.seo_event_slug_base(
      NEW.artist_id, NEW.venue_id, NEW.title, NEW.event_date,
      nullif(to_jsonb(NEW) ->> 'venue_timezone', '')
    );
  EXCEPTION WHEN others THEN
    v_base := public.seo_event_slug_base(NEW.artist_id, NEW.venue_id, NEW.title, NEW.event_date, NULL);
  END;
  IF v_base IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE slug = v_base) THEN
    NEW.slug := v_base || '-' || left(replace(NEW.id::text, '-', ''), 8);
  ELSE
    NEW.slug := v_base;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_seo_assign_slug ON public.events;
CREATE TRIGGER events_seo_assign_slug
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.seo_assign_event_slug();

-- Backfill DC shows only (upcoming plus the last year, so past shows with reviews or
-- setlists get pages). Everything else gets a slug on insert from now on.
WITH dc AS (
  SELECT e.id,
         public.seo_event_slug_base(e.artist_id, e.venue_id, e.title, e.event_date, 'America/New_York') AS base,
         e.event_date
  FROM public.events e
  JOIN public.venues v ON v.id = e.venue_id
  WHERE e.slug IS NULL
    AND v.city ILIKE 'washington' AND v.state = 'District of Columbia'
    AND e.event_date >= now() - interval '1 year'
),
ranked AS (
  SELECT id, base,
         row_number() OVER (PARTITION BY base ORDER BY event_date, id) AS rn
  FROM dc
  WHERE base IS NOT NULL
)
UPDATE public.events e
SET slug = CASE
  WHEN r.rn = 1 AND NOT EXISTS (SELECT 1 FROM public.events x WHERE x.slug = r.base)
    THEN r.base
  ELSE r.base || '-' || left(replace(e.id::text, '-', ''), 8)
END
FROM ranked r
WHERE e.id = r.id;

-- Event pages look up recent setlists and other dates by artist.
CREATE INDEX IF NOT EXISTS events_artist_id_event_date_idx ON public.events (artist_id, event_date);

-- ── Review snippets for public pages ─────────────────────────────────────────
-- Public, published reviews only; returns ratings and text, never who wrote them.
-- Optional text columns are read through to_jsonb so older schemas still work.

CREATE OR REPLACE FUNCTION public.seo_review_snippets(p_artist_id uuid, p_venue_id uuid, p_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pub AS (
    SELECT r.event_id, r.artist_id, r.venue_id, r.created_at,
           coalesce(
             nullif(to_jsonb(r) ->> 'rating', '')::numeric,
             nullif(to_jsonb(r) ->> 'overall_rating', '')::numeric
           ) AS rating,
           nullif(trim(coalesce(
             to_jsonb(r) ->> 'overall_experience_review_text',
             r.review_text,
             to_jsonb(r) ->> 'performance_review_text',
             ''
           )), '') AS body,
           nullif(trim(coalesce(to_jsonb(r) ->> 'venue_review_text', '')), '') AS venue_body
    FROM public.reviews r
    WHERE coalesce(r.is_draft, false) = false
      AND r.is_public = true
      AND (r.artist_id = p_artist_id OR r.venue_id = p_venue_id OR r.event_id = p_event_id)
    ORDER BY r.created_at DESC
    LIMIT 500
  )
  SELECT jsonb_build_object(
    'artist', (
      SELECT jsonb_build_object(
        'count', count(*),
        'avg', round(avg(rating)::numeric, 1),
        'snippets', coalesce((
          SELECT jsonb_agg(jsonb_build_object('rating', s.rating, 'text', left(s.body, 400), 'date', s.created_at))
          FROM (SELECT * FROM pub WHERE artist_id = p_artist_id AND length(body) >= 40 ORDER BY created_at DESC LIMIT 3) s
        ), '[]'::jsonb)
      )
      FROM pub WHERE p_artist_id IS NOT NULL AND artist_id = p_artist_id
    ),
    'venue', (
      SELECT jsonb_build_object(
        'count', count(*),
        'avg', round(avg(rating)::numeric, 1),
        'snippets', coalesce((
          SELECT jsonb_agg(jsonb_build_object('rating', s.rating, 'text', left(coalesce(s.venue_body, s.body), 400), 'date', s.created_at))
          FROM (SELECT * FROM pub WHERE venue_id = p_venue_id AND length(coalesce(venue_body, body)) >= 40 ORDER BY created_at DESC LIMIT 3) s
        ), '[]'::jsonb)
      )
      FROM pub WHERE p_venue_id IS NOT NULL AND venue_id = p_venue_id
    ),
    'event', (
      SELECT jsonb_build_object(
        'count', count(*),
        'avg', round(avg(rating)::numeric, 1),
        'snippets', coalesce((
          SELECT jsonb_agg(jsonb_build_object('rating', s.rating, 'text', left(s.body, 400), 'date', s.created_at))
          FROM (SELECT * FROM pub WHERE event_id = p_event_id AND length(body) >= 40 ORDER BY created_at DESC LIMIT 5) s
        ), '[]'::jsonb)
      )
      FROM pub WHERE p_event_id IS NOT NULL AND event_id = p_event_id
    )
  );
$$;

REVOKE ALL ON FUNCTION public.seo_review_snippets(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_review_snippets(uuid, uuid, uuid) TO anon, authenticated, service_role;

-- ── Search-intent targets ────────────────────────────────────────────────────
-- The searches (and AI questions) Synth wants to show up for. Each one can drive an
-- AI-drafted guide, brand, or comparison page.

CREATE TABLE IF NOT EXISTS public.seo_target_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL UNIQUE,
  cluster text NOT NULL,
  page_type text NOT NULL DEFAULT 'guide' CHECK (page_type IN ('guide', 'brand', 'comparison')),
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  city_slug text DEFAULT 'washington-dc',
  venue_id uuid REFERENCES public.venues (id) ON DELETE SET NULL,
  genre_slug text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seo_target_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage SEO targets" ON public.seo_target_queries;
CREATE POLICY "Admins manage SEO targets"
  ON public.seo_target_queries FOR ALL
  TO authenticated
  USING (public.seo_is_admin())
  WITH CHECK (public.seo_is_admin());

INSERT INTO public.seo_target_queries (query, cluster, page_type, priority, notes) VALUES
  ('how to find people to go to concerts with', 'going-together', 'guide', 95, 'Core intent Synth should own'),
  ('going to a concert alone in DC', 'going-together', 'guide', 90, NULL),
  ('how to make friends through live music in DC', 'going-together', 'guide', 85, NULL),
  ('concert buddy app', 'going-together', 'comparison', 85, NULL),
  ('best apps to find concerts and people to go with', 'going-together', 'comparison', 80, NULL),
  ('new to DC: how to get into the local music scene', 'local-scene', 'guide', 75, NULL),
  ('best small concert venues in DC', 'venues', 'guide', 70, NULL),
  ('best DC concert venues for your first show', 'venues', 'guide', 65, NULL),
  ('date night concert ideas in DC', 'local-scene', 'guide', 60, NULL),
  ('where to see live jazz in DC', 'local-scene', 'guide', 55, NULL),
  ('DC go-go music guide', 'local-scene', 'guide', 50, NULL),
  ('free and cheap concerts in DC', 'local-scene', 'guide', 55, NULL),
  ('what is the Synth app', 'brand', 'brand', 90, 'Entity page for AI assistants'),
  ('how Synth works for concertgoers', 'brand', 'brand', 70, NULL),
  ('is it safe to meet people from a concert app', 'brand', 'brand', 60, NULL),
  ('Synth vs Bandsintown', 'comparison', 'comparison', 70, NULL),
  ('Synth vs Songkick', 'comparison', 'comparison', 60, NULL)
ON CONFLICT (query) DO NOTHING;

-- ── AI-drafted pages with an approval queue ──────────────────────────────────
-- guide -> getsynth.app/guides/{slug}, brand -> /learn/{slug}, comparison -> /compare/{slug}

CREATE TABLE IF NOT EXISTS public.seo_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_query_id uuid REFERENCES public.seo_target_queries (id) ON DELETE SET NULL,
  page_type text NOT NULL CHECK (page_type IN ('guide', 'brand', 'comparison')),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9-]{1,120}$'),
  title text NOT NULL,
  meta_description text NOT NULL,
  summary text NOT NULL,
  body_md text NOT NULL,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  keywords text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'published', 'rejected', 'archived')),
  review_notes text,
  model text,
  grounding jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  UNIQUE (page_type, slug)
);

CREATE INDEX IF NOT EXISTS seo_content_status_idx ON public.seo_content (status, updated_at DESC);

ALTER TABLE public.seo_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads published SEO content" ON public.seo_content;
CREATE POLICY "Anyone reads published SEO content"
  ON public.seo_content FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "Admins manage SEO content" ON public.seo_content;
CREATE POLICY "Admins manage SEO content"
  ON public.seo_content FOR ALL
  TO authenticated
  USING (public.seo_is_admin())
  WITH CHECK (public.seo_is_admin());

-- ── First-party visitor tracking ─────────────────────────────────────────────
-- Written by /api/share?collect=1 with the service role. No IPs stored; visitor_id is a
-- random first-party id. ft_* is the visitor's first-touch source (for signup credit).

CREATE TABLE IF NOT EXISTS public.seo_page_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL DEFAULT 'pageview'
    CHECK (event_name IN ('pageview', 'cta_click', 'app_store_click', 'ticket_click', 'signup')),
  host text NOT NULL,
  path text NOT NULL,
  page_type text,
  referrer_host text,
  referrer_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  source_category text NOT NULL,
  source_name text,
  ft_source_category text,
  ft_source_name text,
  ft_landing_path text,
  country text,
  region text,
  city text,
  device text,
  visitor_id text,
  session_id text
);

CREATE INDEX IF NOT EXISTS seo_page_views_ts_idx ON public.seo_page_views (ts DESC);
CREATE INDEX IF NOT EXISTS seo_page_views_event_ts_idx ON public.seo_page_views (event_name, ts DESC);
CREATE INDEX IF NOT EXISTS seo_page_views_session_idx ON public.seo_page_views (session_id, ts);
CREATE INDEX IF NOT EXISTS seo_page_views_visitor_idx ON public.seo_page_views (visitor_id, ts);

ALTER TABLE public.seo_page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read page views" ON public.seo_page_views;
CREATE POLICY "Admins read page views"
  ON public.seo_page_views FOR SELECT
  TO authenticated
  USING (public.seo_is_admin());

CREATE INDEX IF NOT EXISTS seo_crawler_hits_bot_ts_idx ON public.seo_crawler_hits (bot_name, ts DESC);

-- ── Search Console and Bing Webmaster data ───────────────────────────────────
-- query = '' rows are page totals (Google hides rare queries, so query rows undercount).

CREATE TABLE IF NOT EXISTS public.seo_search_daily (
  date date NOT NULL,
  engine text NOT NULL CHECK (engine IN ('google', 'bing')),
  site text NOT NULL,
  page text NOT NULL DEFAULT '',
  query text NOT NULL DEFAULT '',
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr numeric,
  position numeric,
  PRIMARY KEY (date, engine, site, page, query)
);

CREATE INDEX IF NOT EXISTS seo_search_daily_date_idx ON public.seo_search_daily (date DESC);

ALTER TABLE public.seo_search_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read search data" ON public.seo_search_daily;
CREATE POLICY "Admins read search data"
  ON public.seo_search_daily FOR SELECT
  TO authenticated
  USING (public.seo_is_admin());

-- ── AI assistant mention tracking ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.seo_ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL UNIQUE,
  cluster text NOT NULL DEFAULT 'general',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seo_ai_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage AI prompts" ON public.seo_ai_prompts;
CREATE POLICY "Admins manage AI prompts"
  ON public.seo_ai_prompts FOR ALL
  TO authenticated
  USING (public.seo_is_admin())
  WITH CHECK (public.seo_is_admin());

INSERT INTO public.seo_ai_prompts (prompt, cluster) VALUES
  ('What''s the best app to find people to go to concerts with?', 'going-together'),
  ('I''m going to a concert alone in Washington DC. How can I meet people there?', 'going-together'),
  ('How can I find a concert buddy?', 'going-together'),
  ('What app shows which of my friends are going to a concert?', 'going-together'),
  ('How do I make friends through live music in DC?', 'going-together'),
  ('Best apps for discovering concerts in Washington DC', 'discovery'),
  ('Apps like Bandsintown but more social', 'comparison'),
  ('What are the best concert venues in Washington DC?', 'local'),
  ('What concerts are happening in DC this weekend?', 'local'),
  ('What is the Synth concert app?', 'brand')
ON CONFLICT (prompt) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.seo_ai_mentions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  prompt_id uuid NOT NULL REFERENCES public.seo_ai_prompts (id) ON DELETE CASCADE,
  platform text NOT NULL,
  model text,
  mentioned boolean NOT NULL DEFAULT false,
  synth_cited boolean NOT NULL DEFAULT false,
  synth_rank integer,
  brands_mentioned text[] NOT NULL DEFAULT '{}',
  cited_urls text[] NOT NULL DEFAULT '{}',
  answer_excerpt text,
  error text
);

CREATE INDEX IF NOT EXISTS seo_ai_mentions_run_idx ON public.seo_ai_mentions (run_at DESC);
CREATE INDEX IF NOT EXISTS seo_ai_mentions_prompt_idx ON public.seo_ai_mentions (prompt_id, platform, run_at DESC);

ALTER TABLE public.seo_ai_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read AI mentions" ON public.seo_ai_mentions;
CREATE POLICY "Admins read AI mentions"
  ON public.seo_ai_mentions FOR SELECT
  TO authenticated
  USING (public.seo_is_admin());

-- ── Retention ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seo_prune()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.seo_crawler_hits WHERE ts < now() - interval '180 days';
  DELETE FROM public.seo_page_views WHERE ts < now() - interval '400 days';
  DELETE FROM public.seo_search_daily WHERE date < current_date - 480;
$$;

REVOKE ALL ON FUNCTION public.seo_prune() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_prune() TO service_role;

-- ── Admin dashboard ──────────────────────────────────────────────────────────
-- One call returns every chart and table for the admin SEO dashboard.
-- "visits" = distinct sessions; a session's source is the source of its first hit.

CREATE OR REPLACE FUNCTION public.seo_dashboard(p_days integer DEFAULT 28)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := greatest(1, least(coalesce(p_days, 28), 365));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_prev timestamptz := now() - make_interval(days => v_days * 2);
  v_result jsonb;
BEGIN
  IF NOT public.seo_is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  WITH views AS (
    SELECT * FROM public.seo_page_views WHERE ts >= v_prev
  ),
  sessions AS (
    SELECT DISTINCT ON (session_id)
           session_id, visitor_id, ts, path AS landing_path, host,
           source_category, source_name, country, region, city, device
    FROM views
    WHERE event_name = 'pageview' AND session_id IS NOT NULL
    ORDER BY session_id, ts
  ),
  cur_sessions AS (SELECT * FROM sessions WHERE ts >= v_since),
  conv AS (
    SELECT * FROM views WHERE event_name <> 'pageview' AND ts >= v_since
  ),
  kpi AS (
    SELECT
      (SELECT count(*) FROM views WHERE event_name = 'pageview' AND ts >= v_since) AS pageviews,
      (SELECT count(*) FROM views WHERE event_name = 'pageview' AND ts >= v_prev AND ts < v_since) AS pageviews_prev,
      (SELECT count(*) FROM cur_sessions) AS visits,
      (SELECT count(*) FROM sessions WHERE ts < v_since) AS visits_prev,
      (SELECT count(DISTINCT visitor_id) FROM cur_sessions) AS visitors,
      (SELECT count(*) FROM cur_sessions WHERE source_category = 'organic_search') AS organic_visits,
      (SELECT count(*) FROM sessions WHERE ts < v_since AND source_category = 'organic_search') AS organic_visits_prev,
      (SELECT count(*) FROM cur_sessions WHERE source_category = 'ai_assistant') AS ai_visits,
      (SELECT count(*) FROM sessions WHERE ts < v_since AND source_category = 'ai_assistant') AS ai_visits_prev,
      (SELECT count(*) FROM conv WHERE event_name = 'signup') AS signups,
      (SELECT count(*) FROM views WHERE event_name = 'signup' AND ts >= v_prev AND ts < v_since) AS signups_prev,
      (SELECT count(*) FROM conv WHERE event_name = 'app_store_click') AS app_store_clicks,
      (SELECT count(*) FROM conv WHERE event_name = 'cta_click') AS cta_clicks,
      (SELECT count(*) FROM conv WHERE event_name = 'ticket_click') AS ticket_clicks
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'kpis', (SELECT to_jsonb(kpi) FROM kpi),
    'daily', coalesce((
      SELECT jsonb_agg(d ORDER BY d.day)
      FROM (
        SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day,
               count(*) AS visits,
               count(*) FILTER (WHERE source_category = 'organic_search') AS organic_search,
               count(*) FILTER (WHERE source_category = 'ai_assistant') AS ai_assistant,
               count(*) FILTER (WHERE source_category = 'social') AS social,
               count(*) FILTER (WHERE source_category = 'referral') AS referral,
               count(*) FILTER (WHERE source_category = 'direct') AS direct,
               count(*) FILTER (WHERE source_category NOT IN ('organic_search', 'ai_assistant', 'social', 'referral', 'direct')) AS other
        FROM cur_sessions
        GROUP BY 1
      ) d
    ), '[]'::jsonb),
    'sources', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT g.source_category, g.source_name, g.visits,
               (SELECT count(*) FROM conv c WHERE c.event_name = 'signup'
                  AND c.ft_source_category = g.source_category
                  AND coalesce(c.ft_source_name, '(none)') = g.source_name) AS signups
        FROM (
          SELECT source_category, coalesce(source_name, '(none)') AS source_name, count(*) AS visits
          FROM cur_sessions
          GROUP BY 1, 2
        ) g
        ORDER BY g.visits DESC
        LIMIT 20
      ) s
    ), '[]'::jsonb),
    'ai_platforms', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT coalesce(source_name, 'other') AS platform, count(*) AS visits
        FROM cur_sessions WHERE source_category = 'ai_assistant'
        GROUP BY 1 ORDER BY 2 DESC
      ) s
    ), '[]'::jsonb),
    'landing_pages', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT host, landing_path AS path, count(*) AS visits,
               count(*) FILTER (WHERE source_category = 'organic_search') AS organic,
               count(*) FILTER (WHERE source_category = 'ai_assistant') AS ai
        FROM cur_sessions
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 25
      ) s
    ), '[]'::jsonb),
    'countries', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT coalesce(country, '??') AS country, count(*) AS visits
        FROM cur_sessions GROUP BY 1 ORDER BY 2 DESC LIMIT 15
      ) s
    ), '[]'::jsonb),
    'regions', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT coalesce(country, '??') AS country, coalesce(region, '??') AS region,
               coalesce(city, '') AS city, count(*) AS visits
        FROM cur_sessions GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20
      ) s
    ), '[]'::jsonb),
    'devices', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT coalesce(device, 'unknown') AS device, count(*) AS visits
        FROM cur_sessions GROUP BY 1 ORDER BY 2 DESC
      ) s
    ), '[]'::jsonb),
    'conversions', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT event_name, coalesce(ft_source_category, 'unknown') AS first_touch, count(*) AS total
        FROM conv GROUP BY 1, 2 ORDER BY 3 DESC
      ) s
    ), '[]'::jsonb),
    'search_daily', coalesce((
      SELECT jsonb_agg(s ORDER BY s.day) FROM (
        SELECT to_char(date, 'YYYY-MM-DD') AS day,
               sum(clicks) FILTER (WHERE engine = 'google') AS google_clicks,
               sum(impressions) FILTER (WHERE engine = 'google') AS google_impressions,
               sum(clicks) FILTER (WHERE engine = 'bing') AS bing_clicks,
               sum(impressions) FILTER (WHERE engine = 'bing') AS bing_impressions
        FROM public.seo_search_daily
        WHERE query = '' AND date >= (v_since)::date
        GROUP BY date
      ) s
    ), '[]'::jsonb),
    'top_queries', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT query, sum(clicks) AS clicks, sum(impressions) AS impressions,
               round(sum(position * impressions) / nullif(sum(impressions), 0), 1) AS position,
               string_agg(DISTINCT engine, ',') AS engines
        FROM public.seo_search_daily
        WHERE query <> '' AND date >= (v_since)::date
        GROUP BY query ORDER BY sum(clicks) DESC, sum(impressions) DESC LIMIT 50
      ) s
    ), '[]'::jsonb),
    'top_search_pages', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT page, sum(clicks) AS clicks, sum(impressions) AS impressions,
               round(sum(position * impressions) / nullif(sum(impressions), 0), 1) AS position
        FROM public.seo_search_daily
        WHERE query = '' AND page <> '' AND date >= (v_since)::date
        GROUP BY page ORDER BY sum(clicks) DESC, sum(impressions) DESC LIMIT 30
      ) s
    ), '[]'::jsonb),
    'opportunities', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT query, sum(clicks) AS clicks, sum(impressions) AS impressions,
               round(sum(position * impressions) / nullif(sum(impressions), 0), 1) AS position
        FROM public.seo_search_daily
        WHERE query <> '' AND date >= (v_since)::date
        GROUP BY query
        HAVING sum(impressions) >= 30
           AND sum(position * impressions) / nullif(sum(impressions), 0) BETWEEN 4 AND 30
        ORDER BY sum(impressions) DESC LIMIT 25
      ) s
    ), '[]'::jsonb),
    'ai_visibility', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT platform,
               count(*) FILTER (WHERE error IS NULL) AS runs,
               count(*) FILTER (WHERE mentioned) AS mentioned,
               count(*) FILTER (WHERE synth_cited) AS cited
        FROM public.seo_ai_mentions
        WHERE run_at >= v_since
        GROUP BY platform ORDER BY platform
      ) s
    ), '[]'::jsonb),
    'ai_weekly', coalesce((
      SELECT jsonb_agg(s ORDER BY s.week) FROM (
        SELECT to_char(date_trunc('week', run_at), 'YYYY-MM-DD') AS week, platform,
               round(100.0 * count(*) FILTER (WHERE mentioned) / nullif(count(*) FILTER (WHERE error IS NULL), 0), 1) AS mention_rate
        FROM public.seo_ai_mentions
        WHERE run_at >= now() - interval '180 days'
        GROUP BY 1, 2
      ) s
    ), '[]'::jsonb),
    'ai_latest', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT DISTINCT ON (m.prompt_id, m.platform)
               p.prompt, m.platform, m.run_at, m.mentioned, m.synth_cited, m.synth_rank,
               m.brands_mentioned, m.cited_urls, m.answer_excerpt, m.error
        FROM public.seo_ai_mentions m
        JOIN public.seo_ai_prompts p ON p.id = m.prompt_id
        WHERE p.active
        ORDER BY m.prompt_id, m.platform, m.run_at DESC
      ) s
    ), '[]'::jsonb),
    'competitors', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT brand, count(*) AS mentions
        FROM public.seo_ai_mentions m, unnest(m.brands_mentioned) AS brand
        WHERE m.run_at >= v_since
        GROUP BY brand ORDER BY 2 DESC LIMIT 15
      ) s
    ), '[]'::jsonb),
    'crawlers_daily', coalesce((
      SELECT jsonb_agg(s ORDER BY s.day) FROM (
        SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day,
               count(*) FILTER (WHERE bot_category = 'search') AS search,
               count(*) FILTER (WHERE bot_category = 'ai') AS ai
        FROM public.seo_crawler_hits
        WHERE ts >= v_since
        GROUP BY 1
      ) s
    ), '[]'::jsonb),
    'crawler_bots', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT bot_name, bot_category, count(*) AS hits, max(ts) AS last_seen
        FROM public.seo_crawler_hits
        WHERE ts >= v_since
        GROUP BY 1, 2 ORDER BY 3 DESC
      ) s
    ), '[]'::jsonb),
    'crawler_paths', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT host, path, count(*) AS hits,
               count(*) FILTER (WHERE bot_category = 'ai') AS ai_hits
        FROM public.seo_crawler_hits
        WHERE ts >= v_since
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 25
      ) s
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.seo_dashboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_dashboard(integer) TO authenticated;
