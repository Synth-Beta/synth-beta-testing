-- Faster + more relevant catalog search (artists, venues, events).
--
-- Self-contained: also creates pg_trgm, the match-score helpers, trigram indexes and
-- search_users_fuzzy (see Prerequisites below).
--
-- Replaces the bodies of search_artists_fuzzy / search_venues_fuzzy / search_events_fuzzy
-- from 20260914190000_forgiving_catalog_search.sql. Same names, arguments and return
-- columns, so no client change is required. SECURITY INVOKER as before (RLS still applies).
--
-- What changes
--  1. Short queries (2 chars, the first thing people type) use a prefix lookup on a
--     btree index instead of scoring every name that contains those letters.
--  2. Longer queries always include prefix/exact hits from the btree index, and cap the
--     broad contains/trigram candidate set before the (expensive) similarity scoring.
--  3. search_events_fuzzy no longer takes an arbitrary 200 rows per branch before
--     ranking. It finds the best-matching artists and venues first, then pulls each one's
--     upcoming shows through the (artist_id, event_date) / (venue_id, event_date) indexes.
--     Upcoming shows rank first (soonest first), recent past shows after (newest first).
--     Previously an exact artist match could be missing entirely and results were
--     oldest-first, so most results were past shows.
--
-- Measured on a synthetic catalog (200k artists, 25k venues, 1.66M events) — see
-- supabase/perf-2026-11-19/README.md.

-- ---------------------------------------------------------------------------
-- Prerequisites (from 20260914190000_forgiving_catalog_search.sql, which was never
-- applied to production). Repeated here so this one file sets up all of search.
-- All idempotent: safe to run whether or not that older migration already ran.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.catalog_name_match_score(p_query text, p_name text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN p_name IS NULL OR p_query IS NULL OR btrim(p_query) = '' THEN 0
    WHEN lower(btrim(p_name)) = lower(btrim(p_query)) THEN 100
    WHEN lower(p_name) LIKE lower(btrim(p_query)) || '%' THEN 95
    WHEN lower(' ' || p_name || ' ') LIKE '% ' || lower(btrim(p_query)) || ' %' THEN 90
    WHEN lower(p_name) LIKE '%' || lower(btrim(p_query)) || '%' THEN
      70 + LEAST(20, 20 * char_length(btrim(p_query)) / GREATEST(char_length(p_name), 1))
    ELSE ROUND(
      (
        GREATEST(
          word_similarity(btrim(p_query), p_name),
          strict_word_similarity(btrim(p_query), p_name),
          similarity(btrim(p_query), p_name)
        ) * 70
      )::numeric,
      2
    )::double precision
  END
$$;

CREATE OR REPLACE FUNCTION public.catalog_name_matches(p_name text, p_query text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO public, extensions, pg_temp
AS $$
  SELECT p_name IS NOT NULL
    AND p_query IS NOT NULL
    AND btrim(p_query) <> ''
    AND (
      p_name ILIKE '%' || btrim(p_query) || '%'
      OR p_name ILIKE '%' || regexp_replace(btrim(p_query), '\s+', '%', 'g') || '%'
      OR (
        char_length(btrim(p_query)) >= 4
        AND (
          word_similarity(btrim(p_query), p_name) >= 0.35
          OR strict_word_similarity(btrim(p_query), p_name) >= 0.35
          OR similarity(btrim(p_query), p_name) >= 0.25
          OR word_similarity(split_part(btrim(p_query), ' ', 1), p_name) >= 0.35
        )
      )
    )
$$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON public.artists USING gin (name extensions.gin_trgm_ops)';
  EXCEPTION WHEN undefined_object THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON public.artists USING gin (name gin_trgm_ops)';
  END;
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON public.venues USING gin (name extensions.gin_trgm_ops)';
  EXCEPTION WHEN undefined_object THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON public.venues USING gin (name gin_trgm_ops)';
  END;
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON public.users USING gin (name extensions.gin_trgm_ops)';
  EXCEPTION WHEN undefined_object THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON public.users USING gin (name gin_trgm_ops)';
  END;
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON public.users USING gin (username extensions.gin_trgm_ops)';
  EXCEPTION WHEN undefined_object THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON public.users USING gin (username gin_trgm_ops)';
  END;
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_title_trgm ON public.events USING gin (title extensions.gin_trgm_ops)';
  EXCEPTION WHEN undefined_object THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_title_trgm ON public.events USING gin (title gin_trgm_ops)';
  END;
END $$;

CREATE OR REPLACE FUNCTION public.search_users_fuzzy(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  name text,
  username text,
  avatar_url text,
  bio text,
  account_type text,
  match_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO public, extensions, pg_temp
SET statement_timeout TO '8s'
AS $$
DECLARE
  v_query text := btrim(p_query);
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.35', true);
  PERFORM set_config('pg_trgm.similarity_threshold', '0.25', true);

  RETURN QUERY
  SELECT
    u.user_id,
    u.name,
    u.username,
    u.avatar_url,
    u.bio,
    u.account_type::text,
    GREATEST(
      public.catalog_name_match_score(v_query, COALESCE(u.name, '')),
      public.catalog_name_match_score(v_query, COALESCE(u.username, ''))
    )
  FROM public.users u
  WHERE (p_exclude_user_id IS NULL OR u.user_id <> p_exclude_user_id)
    AND (
      u.name ILIKE '%' || v_query || '%'
      OR u.username ILIKE '%' || v_query || '%'
      OR u.name ILIKE '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
      OR u.username ILIKE '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
      OR (char_length(v_query) >= 4 AND v_query <% COALESCE(u.name, ''))
      OR (char_length(v_query) >= 4 AND v_query <% COALESCE(u.username, ''))
      OR (char_length(split_part(v_query, ' ', 1)) >= 4 AND split_part(v_query, ' ', 1) <% COALESCE(u.name, ''))
    )
  ORDER BY
    GREATEST(
      public.catalog_name_match_score(v_query, COALESCE(u.name, '')),
      public.catalog_name_match_score(v_query, COALESCE(u.username, ''))
    ) DESC,
    u.name ASC NULLS LAST
  OFFSET v_offset
  LIMIT v_limit;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_artists_name_lower_prefix ON public.artists (lower(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_venues_name_lower_prefix ON public.venues (lower(name) text_pattern_ops);
-- Used by the events branch; already created in 20261012120000 / 20261010150000, repeated
-- here so this migration stands alone.
CREATE INDEX IF NOT EXISTS events_artist_id_event_date_idx ON public.events (artist_id, event_date);
CREATE INDEX IF NOT EXISTS events_venue_id_event_date_idx ON public.events (venue_id, event_date);

-- Upper bound for a "starts with" range scan: every string that starts with p is
-- >= p and < p || U+10FFFF under byte-wise (text_pattern_ops) ordering.
CREATE OR REPLACE FUNCTION public.catalog_prefix_upper(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT p || chr(1114111) $$;

-- ---------------------------------------------------------------------------
-- Artists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_artists_fuzzy(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  name text,
  identifier text,
  image_url text,
  genres text[],
  num_upcoming_events integer,
  match_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO public, extensions, pg_temp
SET statement_timeout TO '8s'
-- Plan each call with the real query text: lets the planner drop the branches switched off
-- above and pick the right index for this query (rare vs. very common words).
SET plan_cache_mode TO force_custom_plan
AS $$
DECLARE
  v_query text := btrim(p_query);
  v_lower text;
  v_the text;
  v_gappy text;
  v_fuzzy boolean;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;
  v_lower := lower(v_query);
  v_the := 'the ' || v_lower;
  -- "words in order, anything between" pattern. Only when every word has 3+ letters:
  -- with a 1-2 letter word ("the ka") it matched a quarter of the catalog in testing.
  v_gappy := CASE
    WHEN v_query ~ '\s' AND NOT EXISTS (
      SELECT 1 FROM regexp_split_to_table(v_query, '\s+') w WHERE char_length(w) < 3)
    THEN '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
    ELSE '%' || v_query || '%'
  END;
  -- Typo matching only once every word has 3+ letters. "the ka" is someone still typing
  -- ("the kazo…"), already covered by the prefix lookup; fuzzy-matching it rechecked
  -- ~55k names because of the trigram "the".
  v_fuzzy := NOT EXISTS (SELECT 1 FROM regexp_split_to_table(v_query, '\s+') w WHERE char_length(w) < 3);

  -- 2 characters: trigram indexes can't help, so do a prefix lookup ("ta" -> "Taylor
  -- Swift", "The Tallest Man") and rank by popularity.
  IF char_length(v_query) < 3 THEN
    RETURN QUERY
    SELECT a.id, a.name, a.identifier, a.image_url, a.genres,
           COALESCE(a.num_upcoming_events, 0)::integer,
           95::double precision
    FROM public.artists a
    WHERE (lower(a.name) ~>=~ v_lower AND lower(a.name) ~<~ public.catalog_prefix_upper(v_lower))
       OR (lower(a.name) ~>=~ v_the AND lower(a.name) ~<~ public.catalog_prefix_upper(v_the))
    ORDER BY COALESCE(a.num_upcoming_events, 0) DESC, a.name ASC
    LIMIT v_limit;
    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.35', true);
  PERFORM set_config('pg_trgm.similarity_threshold', '0.25', true);

  RETURN QUERY
  WITH broad AS MATERIALIZED (
    -- Contains / whole-word / typo-tolerant matches. MATERIALIZED keeps the LIMIT below
    -- from tempting the planner into a sequential scan; the trigram index is used here.
    SELECT a.id, COALESCE(a.num_upcoming_events, 0) AS upcoming
    FROM public.artists a
    WHERE a.name ILIKE '%' || v_query || '%'
       OR a.name ILIKE v_gappy
       OR (v_fuzzy AND char_length(v_query) >= 4 AND v_query <% a.name)
       OR (v_fuzzy AND char_length(split_part(v_query, ' ', 1)) >= 4 AND split_part(v_query, ' ', 1) <% a.name)
  ),
  candidates AS (
    -- Exact / prefix hits (always kept, however many broad matches there are).
    (SELECT a.id
     FROM public.artists a
     WHERE (lower(a.name) ~>=~ v_lower AND lower(a.name) ~<~ public.catalog_prefix_upper(v_lower))
        OR (lower(a.name) ~>=~ v_the AND lower(a.name) ~<~ public.catalog_prefix_upper(v_the))
     ORDER BY COALESCE(a.num_upcoming_events, 0) DESC
     LIMIT 100)
    UNION
    -- Broad matches, capped before the (expensive) similarity scoring.
    -- When a common word or typo matches thousands of names, keep the ones with the most
    -- upcoming shows (the ones people are looking for).
    (SELECT b.id FROM broad b ORDER BY b.upcoming DESC LIMIT 600)
  ),
  scored AS (
    SELECT a.*, public.catalog_name_match_score(v_query, a.name) AS score
    FROM candidates c
    JOIN public.artists a ON a.id = c.id
  )
  SELECT r.id, r.name, r.identifier, r.image_url, r.genres,
         -- Live count for the rows returned (index lookups on (artist_id, event_date)), so
         -- clients don't need a second round trip when the cached column is stale.
         GREATEST(COALESCE(r.num_upcoming_events, 0),
                  (SELECT count(*) FROM public.events e
                   WHERE e.artist_id = r.id AND e.event_date >= date_trunc('day', now())))::integer,
         r.score
  FROM (
    SELECT s.* FROM scored s
    ORDER BY s.score DESC, COALESCE(s.num_upcoming_events, 0) DESC, s.name ASC
    LIMIT v_limit
  ) r
  ORDER BY r.score DESC, COALESCE(r.num_upcoming_events, 0) DESC, r.name ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_venues_fuzzy(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  name text,
  identifier text,
  image_url text,
  city text,
  state text,
  street_address text,
  latitude double precision,
  longitude double precision,
  num_upcoming_events integer,
  match_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO public, extensions, pg_temp
SET statement_timeout TO '8s'
-- Plan each call with the real query text: lets the planner drop the branches switched off
-- above and pick the right index for this query (rare vs. very common words).
SET plan_cache_mode TO force_custom_plan
AS $$
DECLARE
  v_query text := btrim(p_query);
  v_lower text;
  v_the text;
  v_gappy text;
  v_fuzzy boolean;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;
  v_lower := lower(v_query);
  v_the := 'the ' || v_lower;
  -- "words in order, anything between" pattern. Only when every word has 3+ letters:
  -- with a 1-2 letter word ("the ka") it matched a quarter of the catalog in testing.
  v_gappy := CASE
    WHEN v_query ~ '\s' AND NOT EXISTS (
      SELECT 1 FROM regexp_split_to_table(v_query, '\s+') w WHERE char_length(w) < 3)
    THEN '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
    ELSE '%' || v_query || '%'
  END;
  -- Typo matching only once every word has 3+ letters. "the ka" is someone still typing
  -- ("the kazo…"), already covered by the prefix lookup; fuzzy-matching it rechecked
  -- ~55k names because of the trigram "the".
  v_fuzzy := NOT EXISTS (SELECT 1 FROM regexp_split_to_table(v_query, '\s+') w WHERE char_length(w) < 3);

  IF char_length(v_query) < 3 THEN
    RETURN QUERY
    SELECT v.id, v.name, v.identifier, v.image_url, v.city, v.state, v.street_address,
           v.latitude::double precision, v.longitude::double precision,
           COALESCE(v.num_upcoming_events, 0)::integer,
           95::double precision
    FROM public.venues v
    WHERE (lower(v.name) ~>=~ v_lower AND lower(v.name) ~<~ public.catalog_prefix_upper(v_lower))
       OR (lower(v.name) ~>=~ v_the AND lower(v.name) ~<~ public.catalog_prefix_upper(v_the))
    ORDER BY COALESCE(v.num_upcoming_events, 0) DESC, v.name ASC
    LIMIT v_limit;
    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.35', true);
  PERFORM set_config('pg_trgm.similarity_threshold', '0.25', true);

  RETURN QUERY
  WITH broad AS MATERIALIZED (
    -- Contains / whole-word / typo-tolerant matches. MATERIALIZED keeps the LIMIT below
    -- from tempting the planner into a sequential scan; the trigram index is used here.
    SELECT v.id, COALESCE(v.num_upcoming_events, 0) AS upcoming
    FROM public.venues v
    WHERE v.name ILIKE '%' || v_query || '%'
       OR v.name ILIKE v_gappy
       OR (v_fuzzy AND char_length(v_query) >= 4 AND v_query <% v.name)
       OR (v_fuzzy AND char_length(split_part(v_query, ' ', 1)) >= 4 AND split_part(v_query, ' ', 1) <% v.name)
  ),
  candidates AS (
    -- Exact / prefix hits (always kept, however many broad matches there are).
    (SELECT v.id
     FROM public.venues v
     WHERE (lower(v.name) ~>=~ v_lower AND lower(v.name) ~<~ public.catalog_prefix_upper(v_lower))
        OR (lower(v.name) ~>=~ v_the AND lower(v.name) ~<~ public.catalog_prefix_upper(v_the))
     ORDER BY COALESCE(v.num_upcoming_events, 0) DESC
     LIMIT 100)
    UNION
    -- When a common word or typo matches thousands of names, keep the ones with the most
    -- upcoming shows (the ones people are looking for).
    (SELECT b.id FROM broad b ORDER BY b.upcoming DESC LIMIT 600)
  ),
  scored AS (
    SELECT v.*, public.catalog_name_match_score(v_query, v.name) AS score
    FROM candidates c
    JOIN public.venues v ON v.id = c.id
  )
  SELECT s.id, s.name, s.identifier, s.image_url, s.city, s.state, s.street_address,
         s.latitude::double precision, s.longitude::double precision,
         COALESCE(s.num_upcoming_events, 0)::integer,
         s.score
  FROM scored s
  ORDER BY s.score DESC, COALESCE(s.num_upcoming_events, 0) DESC, s.name ASC
  LIMIT v_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_events_fuzzy(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  event_date timestamptz,
  artist_id uuid,
  venue_id uuid,
  artist_name text,
  venue_name text,
  venue_city text,
  event_media_url text,
  images jsonb,
  ticket_urls jsonb,
  match_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO public, extensions, pg_temp
SET statement_timeout TO '8s'
-- Plan each call with the real query text: lets the planner drop the branches switched off
-- above and pick the right index for this query (rare vs. very common words).
SET plan_cache_mode TO force_custom_plan
AS $$
DECLARE
  v_query text := btrim(p_query);
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
  -- Shows earlier today still count as upcoming.
  v_today timestamptz := date_trunc('day', now());
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  -- Title-only matches (festival / tour names), upcoming only, 4+ chars. Plain contains
  -- match: typo tolerance comes from the artist/venue branches (fuzzy-matching every event
  -- title matched ~450k rows for a two-word query in testing). MATERIALIZED so the LIMIT
  -- applied later doesn't push the planner off the trigram index.
  title_matches AS MATERIALIZED (
    SELECT e.id, e.title FROM public.events e
    WHERE char_length(v_query) >= 4
      AND e.event_date >= v_today
      AND e.title ILIKE '%' || v_query || '%'
  ),
  top_artists AS (
    SELECT s.id, s.match_score FROM public.search_artists_fuzzy(v_query, 25) s
  ),
  top_venues AS (
    SELECT s.id, s.match_score FROM public.search_venues_fuzzy(v_query, 10) s
  ),
  hits AS (
    -- Each matching artist's next shows, then its most recent past shows.
    SELECT e.id, ta.match_score AS score
    FROM top_artists ta
    CROSS JOIN LATERAL (
      SELECT e.id FROM public.events e
      WHERE e.artist_id = ta.id AND e.event_date >= v_today
      ORDER BY e.event_date ASC LIMIT 25
    ) e
    UNION ALL
    SELECT e.id, ta.match_score - 1
    FROM top_artists ta
    CROSS JOIN LATERAL (
      SELECT e.id FROM public.events e
      WHERE e.artist_id = ta.id AND e.event_date < v_today
      ORDER BY e.event_date DESC LIMIT 5
    ) e
    UNION ALL
    SELECT e.id, tv.match_score
    FROM top_venues tv
    CROSS JOIN LATERAL (
      SELECT e.id FROM public.events e
      WHERE e.venue_id = tv.id AND e.event_date >= v_today
      ORDER BY e.event_date ASC LIMIT 15
    ) e
    UNION ALL
    SELECT t.id, public.catalog_name_match_score(v_query, t.title)
    FROM (SELECT tm.id, tm.title FROM title_matches tm LIMIT 150) t
  ),
  best AS (
    SELECT h.id, max(h.score) AS score FROM hits h GROUP BY h.id
  )
  SELECT
    e.id,
    e.title,
    e.event_date::timestamptz,
    e.artist_id,
    e.venue_id,
    a.name,
    v.name,
    COALESCE(e.venue_city, v.city),
    e.event_media_url,
    to_jsonb(e.images),
    to_jsonb(e.ticket_urls),
    b.score
  FROM best b
  JOIN public.events e ON e.id = b.id
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  ORDER BY
    (e.event_date >= v_today) DESC,           -- upcoming first
    b.score DESC,                              -- then best match (artist/venue/title)
    CASE WHEN e.event_date >= v_today THEN e.event_date END ASC,   -- soonest upcoming
    e.event_date DESC                                              -- newest past
  OFFSET v_offset
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catalog_prefix_upper(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_artists_fuzzy(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_venues_fuzzy(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_events_fuzzy(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_name_match_score(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_name_matches(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_fuzzy(text, integer, integer, uuid) TO anon, authenticated;
