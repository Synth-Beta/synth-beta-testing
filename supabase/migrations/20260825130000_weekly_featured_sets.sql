-- Weekly featured set: shared Home + Discover curation source of truth (LOI-566)
-- DC local calendar week (America/New_York). Editable by admin without an app release.
-- Cap: published sets must have 10–15 shows (target 12). Drafts may have 0–15.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers: DC calendar week (Monday 00:00 America/New_York)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dc_week_start(ts timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    (timezone('America/New_York', ts))::date
    - ((EXTRACT(DOW FROM timezone('America/New_York', ts))::int + 6) % 7)
  )::date;
$$;

CREATE OR REPLACE FUNCTION public.dc_week_id(ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(public.dc_week_start(ts), 'IYYY') || '-W' || to_char(public.dc_week_start(ts), 'IW');
$$;

COMMENT ON FUNCTION public.dc_week_start IS
  'Monday date of the DC (America/New_York) calendar week containing ts.';
COMMENT ON FUNCTION public.dc_week_id IS
  'ISO-like week id (YYYY-Www) for the DC local calendar week containing ts.';

-- ---------------------------------------------------------------------------
-- Sets (one per DC week)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_featured_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id text NOT NULL,
  week_start_date date NOT NULL,
  metro text NOT NULL DEFAULT 'dc'
    CHECK (metro = 'dc'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  target_count int NOT NULL DEFAULT 12
    CHECK (target_count BETWEEN 10 AND 15),
  notes text,
  published_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metro, week_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_featured_sets_status_week
  ON public.weekly_featured_sets (metro, status, week_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_featured_sets_week_start
  ON public.weekly_featured_sets (week_start_date DESC);

-- ---------------------------------------------------------------------------
-- Items (ordered pins within a set)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_featured_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.weekly_featured_sets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  position int NOT NULL CHECK (position >= 1 AND position <= 15),
  genre text,
  curator_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_id, event_id),
  UNIQUE (set_id, position)
);

CREATE INDEX IF NOT EXISTS idx_weekly_featured_items_set_pos
  ON public.weekly_featured_items (set_id, position);

CREATE INDEX IF NOT EXISTS idx_weekly_featured_items_event
  ON public.weekly_featured_items (event_id);

-- ---------------------------------------------------------------------------
-- Publish gate: 10–15 items, at least 2 distinct genres when genres present
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_weekly_featured_set_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_count int;
  genre_count int;
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    SELECT count(*) INTO item_count
    FROM public.weekly_featured_items
    WHERE set_id = NEW.id;

    IF item_count < 10 OR item_count > 15 THEN
      RAISE EXCEPTION 'published weekly featured set must have 10–15 shows (got %)', item_count
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(DISTINCT lower(trim(genre))) INTO genre_count
    FROM public.weekly_featured_items
    WHERE set_id = NEW.id
      AND genre IS NOT NULL
      AND length(trim(genre)) > 0;

    IF genre_count = 1 THEN
      RAISE EXCEPTION 'published weekly featured set must mix genres (got a single genre)'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weekly_featured_sets_publish ON public.weekly_featured_sets;
CREATE TRIGGER trg_weekly_featured_sets_publish
  BEFORE INSERT OR UPDATE ON public.weekly_featured_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_weekly_featured_set_publish();

-- Cap items per set at 15 (defense in depth beyond position check)
CREATE OR REPLACE FUNCTION public.validate_weekly_featured_item_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_count int;
BEGIN
  SELECT count(*) INTO item_count
  FROM public.weekly_featured_items
  WHERE set_id = NEW.set_id
    AND id IS DISTINCT FROM NEW.id;

  IF item_count >= 15 THEN
    RAISE EXCEPTION 'weekly featured set hard cap is 15 shows'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weekly_featured_items_cap ON public.weekly_featured_items;
CREATE TRIGGER trg_weekly_featured_items_cap
  BEFORE INSERT ON public.weekly_featured_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_weekly_featured_item_cap();

-- ---------------------------------------------------------------------------
-- Read model: current published set for a metro (+ optional week)
-- ---------------------------------------------------------------------------
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
    COALESCE(a.name, NULLIF(split_part(e.title, ' at ', 1), '')) AS artist_name,
    v.name AS venue_name,
    COALESCE(v.city, e.venue_city) AS venue_city,
    e.event_date,
    COALESCE(e.event_media_url, e.media_urls[1]) AS image_url,
    e.genres AS event_genres
  FROM chosen c
  JOIN public.weekly_featured_items i ON i.set_id = c.id
  JOIN public.events e ON e.id = i.event_id
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  ORDER BY i.position ASC;
$$;

GRANT EXECUTE ON FUNCTION public.dc_week_start(timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dc_week_id(timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_featured_set(text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.weekly_featured_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_featured_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published weekly featured sets" ON public.weekly_featured_sets;
CREATE POLICY "Anyone can read published weekly featured sets"
  ON public.weekly_featured_sets FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "Admins can read all weekly featured sets" ON public.weekly_featured_sets;
CREATE POLICY "Admins can read all weekly featured sets"
  ON public.weekly_featured_sets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'::account_type
    )
  );

DROP POLICY IF EXISTS "Admins manage weekly featured sets" ON public.weekly_featured_sets;
CREATE POLICY "Admins manage weekly featured sets"
  ON public.weekly_featured_sets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'::account_type
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'::account_type
    )
  );

DROP POLICY IF EXISTS "Anyone can read items of published weekly featured sets" ON public.weekly_featured_items;
CREATE POLICY "Anyone can read items of published weekly featured sets"
  ON public.weekly_featured_items FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_featured_sets s
      WHERE s.id = set_id AND s.status = 'published'
    )
  );

DROP POLICY IF EXISTS "Admins manage weekly featured items" ON public.weekly_featured_items;
CREATE POLICY "Admins manage weekly featured items"
  ON public.weekly_featured_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'::account_type
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'::account_type
    )
  );
