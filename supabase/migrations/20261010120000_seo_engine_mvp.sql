-- SEO engine MVP (DC pilot): public URL slugs for venues/artists, a settings row that
-- keeps every public page noindex until an admin flips it live, crawler-hit logging,
-- and the list of DC pages that qualify for indexing.

-- ── Slugs ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seo_slugify(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    trim(BOTH '-' FROM regexp_replace(
      translate(lower(coalesce(p_text, '')), 'áàâäãåéèêëíìîïóòôöõúùûüñçø', 'aaaaaaeeeeiiiiooooouuuunco'),
      '[^a-z0-9]+', '-', 'g'
    )),
    ''
  );
$$;

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS slug text;

-- Backfill. The busiest entity gets the clean slug; same-name ones get an id suffix.
WITH ranked AS (
  SELECT id,
         public.seo_slugify(name || ' ' || coalesce(city, '')) AS base,
         row_number() OVER (
           PARTITION BY public.seo_slugify(name || ' ' || coalesce(city, ''))
           ORDER BY num_upcoming_events DESC NULLS LAST, created_at, id
         ) AS rn
  FROM public.venues
  WHERE slug IS NULL
)
UPDATE public.venues v
SET slug = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || left(replace(v.id::text, '-', ''), 8) END
FROM ranked r
WHERE v.id = r.id AND r.base IS NOT NULL;

WITH ranked AS (
  SELECT id,
         public.seo_slugify(name) AS base,
         row_number() OVER (
           PARTITION BY public.seo_slugify(name)
           ORDER BY num_upcoming_events DESC NULLS LAST, created_at, id
         ) AS rn
  FROM public.artists
  WHERE slug IS NULL
)
UPDATE public.artists a
SET slug = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || left(replace(a.id::text, '-', ''), 8) END
FROM ranked r
WHERE a.id = r.id AND r.base IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS venues_slug_key ON public.venues (slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS artists_slug_key ON public.artists (slug) WHERE slug IS NOT NULL;

-- New rows from the JamBase sync get a slug on insert. A taken slug gets an id suffix
-- instead of raising, so a name collision can never fail a sync batch. Renames keep
-- the old slug on purpose: public URLs stay stable.
CREATE OR REPLACE FUNCTION public.seo_assign_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_taken boolean;
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- to_jsonb: artists has no city column, and NEW.city would fail to resolve there.
  v_base := public.seo_slugify(
    CASE WHEN TG_TABLE_NAME = 'venues'
      THEN NEW.name || ' ' || coalesce(to_jsonb(NEW) ->> 'city', '')
      ELSE NEW.name
    END
  );
  IF v_base IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE slug = $1)', TG_TABLE_SCHEMA, TG_TABLE_NAME)
    INTO v_taken
    USING v_base;

  NEW.slug := CASE WHEN v_taken THEN v_base || '-' || left(replace(NEW.id::text, '-', ''), 8) ELSE v_base END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_seo_assign_slug ON public.venues;
CREATE TRIGGER venues_seo_assign_slug
  BEFORE INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.seo_assign_slug();

DROP TRIGGER IF EXISTS artists_seo_assign_slug ON public.artists;
CREATE TRIGGER artists_seo_assign_slug
  BEFORE INSERT ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.seo_assign_slug();

-- ── Settings (single row) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.seo_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mode text NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'live')),
  min_venue_events integer NOT NULL DEFAULT 3 CHECK (min_venue_events BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.seo_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.seo_settings ENABLE ROW LEVEL SECURITY;

-- The public page renderer reads the mode with the anon key; nothing here is secret.
DROP POLICY IF EXISTS "Anyone can read SEO settings" ON public.seo_settings;
CREATE POLICY "Anyone can read SEO settings"
  ON public.seo_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins update SEO settings" ON public.seo_settings;
CREATE POLICY "Admins update SEO settings"
  ON public.seo_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  );

-- ── Crawler hits ─────────────────────────────────────────────────────────────
-- Written by middleware.ts with the service role (bypasses RLS); read by admins only.

CREATE TABLE IF NOT EXISTS public.seo_crawler_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  host text NOT NULL,
  path text NOT NULL,
  bot_name text NOT NULL,
  bot_category text NOT NULL CHECK (bot_category IN ('search', 'ai'))
);

CREATE INDEX IF NOT EXISTS seo_crawler_hits_ts_idx ON public.seo_crawler_hits (ts DESC);

ALTER TABLE public.seo_crawler_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read crawler hits" ON public.seo_crawler_hits;
CREATE POLICY "Admins read crawler hits"
  ON public.seo_crawler_hits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  );

-- ── DC page candidates ───────────────────────────────────────────────────────
-- Every DC venue plus every artist with an upcoming DC show, with upcoming counts.
-- Used by the sitemap (anon) and the admin SEO tab. Data is already public.
-- shortcut: DC is hard-coded; add a cities list to seo_settings when a second city launches.

CREATE OR REPLACE FUNCTION public.seo_page_candidates()
RETURNS TABLE (entity_type text, entity_id uuid, name text, slug text, upcoming_events integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH dc_venues AS (
    SELECT v.id, v.name, v.slug
    FROM public.venues v
    WHERE v.city ILIKE 'washington' AND v.state = 'District of Columbia'
  ),
  upcoming AS (
    SELECT e.venue_id, e.artist_id
    FROM public.events e
    JOIN dc_venues dv ON dv.id = e.venue_id
    WHERE e.event_date >= now()
      AND coalesce(e.event_status, 'scheduled') <> 'cancelled'
  )
  SELECT 'venue', dv.id, dv.name, dv.slug,
         (SELECT count(*) FROM upcoming u WHERE u.venue_id = dv.id)::integer
  FROM dc_venues dv
  UNION ALL
  SELECT 'artist', a.id, a.name, a.slug, count(*)::integer
  FROM upcoming u
  JOIN public.artists a ON a.id = u.artist_id
  GROUP BY a.id, a.name, a.slug;
$$;

REVOKE ALL ON FUNCTION public.seo_page_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_page_candidates() TO anon, authenticated, service_role;
