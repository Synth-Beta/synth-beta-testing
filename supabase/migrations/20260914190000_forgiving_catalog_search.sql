-- Forgiving catalog search: case-insensitive contains + pg_trgm close matches,
-- ranked so exact/prefix/whole-word hits beat weaker partial/fuzzy hits.
-- SECURITY INVOKER so existing RLS on artists/venues/events/users still applies.

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
AS $$
DECLARE
  v_query text := btrim(p_query);
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.35', true);
  PERFORM set_config('pg_trgm.similarity_threshold', '0.25', true);

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.identifier,
    a.image_url,
    a.genres,
    COALESCE(a.num_upcoming_events, 0)::integer,
    public.catalog_name_match_score(v_query, a.name)
  FROM public.artists a
  WHERE a.name ILIKE '%' || v_query || '%'
     OR a.name ILIKE '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
     OR (char_length(v_query) >= 4 AND v_query <% a.name)
     OR (char_length(split_part(v_query, ' ', 1)) >= 4 AND split_part(v_query, ' ', 1) <% a.name)
  ORDER BY
    public.catalog_name_match_score(v_query, a.name) DESC,
    COALESCE(a.num_upcoming_events, 0) DESC,
    a.name ASC
  LIMIT v_limit;
END;
$$;

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
AS $$
DECLARE
  v_query text := btrim(p_query);
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.35', true);
  PERFORM set_config('pg_trgm.similarity_threshold', '0.25', true);

  RETURN QUERY
  SELECT
    v.id,
    v.name,
    v.identifier,
    v.image_url,
    v.city,
    v.state,
    v.street_address,
    v.latitude::double precision,
    v.longitude::double precision,
    COALESCE(v.num_upcoming_events, 0)::integer,
    public.catalog_name_match_score(v_query, v.name)
  FROM public.venues v
  WHERE v.name ILIKE '%' || v_query || '%'
     OR v.name ILIKE '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
     OR (char_length(v_query) >= 4 AND v_query <% v.name)
     OR (char_length(split_part(v_query, ' ', 1)) >= 4 AND split_part(v_query, ' ', 1) <% v.name)
  ORDER BY
    public.catalog_name_match_score(v_query, v.name) DESC,
    COALESCE(v.num_upcoming_events, 0) DESC,
    v.name ASC
  LIMIT v_limit;
END;
$$;

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
  WITH matched AS (
    (
      SELECT e.id
      FROM public.events e
      WHERE e.title ILIKE '%' || v_query || '%'
         OR e.title ILIKE '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
         OR (char_length(v_query) >= 4 AND v_query <% e.title)
         OR (char_length(split_part(v_query, ' ', 1)) >= 4 AND split_part(v_query, ' ', 1) <% e.title)
      LIMIT 200
    )
    UNION
    (
      SELECT e.id
      FROM public.events e
      JOIN public.artists a ON a.id = e.artist_id
      WHERE a.name ILIKE '%' || v_query || '%'
         OR a.name ILIKE '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
         OR (char_length(v_query) >= 4 AND v_query <% a.name)
         OR (char_length(split_part(v_query, ' ', 1)) >= 4 AND split_part(v_query, ' ', 1) <% a.name)
      LIMIT 200
    )
    UNION
    (
      SELECT e.id
      FROM public.events e
      JOIN public.venues v ON v.id = e.venue_id
      WHERE v.name ILIKE '%' || v_query || '%'
         OR v.name ILIKE '%' || regexp_replace(v_query, '\s+', '%', 'g') || '%'
         OR (char_length(v_query) >= 4 AND v_query <% v.name)
         OR (char_length(split_part(v_query, ' ', 1)) >= 4 AND split_part(v_query, ' ', 1) <% v.name)
      LIMIT 200
    )
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
    GREATEST(
      public.catalog_name_match_score(v_query, COALESCE(e.title, '')),
      public.catalog_name_match_score(v_query, COALESCE(a.name, '')),
      public.catalog_name_match_score(v_query, COALESCE(v.name, ''))
    )
  FROM matched m
  JOIN public.events e ON e.id = m.id
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  ORDER BY
    GREATEST(
      public.catalog_name_match_score(v_query, COALESCE(e.title, '')),
      public.catalog_name_match_score(v_query, COALESCE(a.name, '')),
      public.catalog_name_match_score(v_query, COALESCE(v.name, ''))
    ) DESC,
    e.event_date ASC NULLS LAST
  OFFSET v_offset
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catalog_name_match_score(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_name_matches(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_artists_fuzzy(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_venues_fuzzy(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_fuzzy(text, integer, integer, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_events_fuzzy(text, integer, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.search_artists_fuzzy(text, integer) IS
  'Case-insensitive contains + trigram catalog search for artists, ranked by match quality.';
