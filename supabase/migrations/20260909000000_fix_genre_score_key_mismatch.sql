-- =============================================================================
-- Fix: genre_preference_scores keys never matched the ranker's lookup
-- =============================================================================
-- REVIEW THIS, THEN APPLY IT YOURSELF. Nothing here is auto-applied.
--
-- Generated from the LIVE definition of refresh_user_preferences_v5 (pulled via
-- pg_get_functiondef on 2026-09-09) by substituting the genre_by_user / genre_agg
-- CTEs only. Every other CTE, the INSERT, the ON CONFLICT block and the signature
-- are byte-identical to what is running now. Postgres has no partial function
-- edit, so the whole body is restated regardless.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────────
-- The two sides of the same lookup used different normalizers:
--
--   WRITE (here):  resolve_genre_to_canonical(genre) -> genres.name
--                  produces "Hip Hop Rap", "Edm", "R&B"
--   READ  (get_personalized_feed_v5):
--                  genre_match_slug(genre), joined to genre_idf.genre_slug
--                  produces  hip-hop-rap,  edm,  r-b
--
-- So `v_genre_scores->>'edm'` returned NULL against a map keyed "Edm".
-- genre_sum was ALWAYS 0, for every user, and is_match collapsed to
-- `artist_sum > 0`. Recommended has been ranked by artist scores alone; every
-- genre-only candidate scored as a non-match and survived only because the
-- relevance gate is `ORDER BY (NOT is_match)` -- a sort, not a filter.
--
-- Verified live: genre_match_slug('EDM')='edm', ('Hip Hop Rap')='hip-hop-rap',
-- ('R&B')='r-b', while that user's score map is keyed "Edm"/"Hip Hop Rap"/"R&B".
-- All 56 of their genre keys were dead. This is why an EDM/hip-hop listener was
-- served folk, classical, and a metal act (Lynch Mob) they had no affinity for:
-- none of those were matches, they were filler.
--
-- The 20260824000000 slug-normalization fix normalized the EVENT side only, so
-- all subsequent genre work -- IDF, and the 20260831000000 coverage term -- has
-- been computing against keys that could never match.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
-- Key the score map by genre_match_slug(canonical), so synonym collapsing is
-- preserved AND the key is what the ranker looks up.
--
-- top_genres is deliberately LEFT as human-readable genres.name values: it is
-- documented as the display source (supabase/genre-pipeline-2026-08-20 line 35)
-- and StreamingStatsPage renders it. Slugs there would show users "hip-hop-rap".
-- Grouping therefore moves to the slug, with min(canonical) as the label, so two
-- canonical names that slugify alike merge their scores instead of silently
-- clobbering each other in jsonb_object_agg (which keeps the last value, no error).
--
-- Also drops the 'small artist' sentinel: artists.genres uses it as an empty
-- state, and it was being stored as a genre the user likes -- weight 13.29 in the
-- reviewed account, above Rock.
--
-- ── AFTER APPLYING (both steps, or it is a no-op) ─────────────────────────────
--   SELECT public.refresh_user_preferences_v5(NULL);   -- recompute every user
--   DELETE FROM public.personalized_feed_cache;        -- cached feeds are stale
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_user_preferences_v5(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH users_to_refresh AS (
    SELECT DISTINCT ups.user_id AS uid
    FROM public.user_preference_signals ups
    -- CHANGED (this migration): only refresh signals whose user still exists.
    -- Signals can outlive their owner — a deleted account, or a public.users row that
    -- was never created — and user_preferences has an FK to users. Without this join a
    -- single orphaned signal aborts the entire all-users refresh with 23503 instead of
    -- skipping one row. Per-user calls never surfaced it because they never touched the
    -- orphan.
    JOIN public.users usr ON usr.user_id = ups.user_id
    WHERE p_user_id IS NULL OR ups.user_id = p_user_id
  ),
  sig_stats AS (
    SELECT
      ups.user_id,
      max(ups.occurred_at) AS last_signal_at,
      count(*)::integer AS signal_count
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    GROUP BY ups.user_id
  ),
  -- CHANGED (this migration): group by the MATCH SLUG, not the canonical display
  -- name. resolve_genre_to_canonical still runs first so "pop"/"Pop"/"jamband"/
  -- "Jam Band" collapse; genre_match_slug then puts the key in the form
  -- get_personalized_feed_v5 actually looks up. min(canonical) survives as the
  -- human label for top_genres.
  genre_by_user AS (
    SELECT
      ups.user_id,
      public.genre_match_slug(COALESCE(public.resolve_genre_to_canonical(ups.genre), ups.genre)) AS genre_key,
      min(COALESCE(public.resolve_genre_to_canonical(ups.genre), ups.genre)) AS canonical_genre,
      sum(public.decay_weight(ups.signal_type::text, ups.signal_weight, ups.occurred_at))::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.genre IS NOT NULL
      -- artists.genres uses 'small artist' as an empty state; it is not a taste.
      AND lower(btrim(ups.genre)) <> 'small artist'
    GROUP BY ups.user_id,
             public.genre_match_slug(COALESCE(public.resolve_genre_to_canonical(ups.genre), ups.genre))
  ),
  genre_agg AS (
    SELECT
      user_id,
      -- CHANGED: slug keys, so the ranker's ->>genre_slug lookup can hit.
      jsonb_object_agg(genre_key, score) AS scores,
      -- UNCHANGED in meaning: display names, ordered by score, for the Stats UI.
      (SELECT array_agg(g.canonical_genre ORDER BY g.score DESC) FROM (
        SELECT canonical_genre, score FROM genre_by_user g2 WHERE g2.user_id = genre_by_user.user_id ORDER BY score DESC LIMIT 20
      ) g) AS top_list
    FROM genre_by_user
    GROUP BY user_id
  ),
  artist_by_user AS (
    SELECT user_id, entity_id, sum(public.decay_weight(ups.signal_type::text, ups.signal_weight, ups.occurred_at))::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.entity_type = 'artist' AND ups.entity_id IS NOT NULL
    GROUP BY ups.user_id, ups.entity_id
  ),
  artist_agg AS (
    SELECT
      user_id,
      jsonb_object_agg(entity_id::text, score) AS scores,
      (SELECT array_agg(a.entity_id ORDER BY a.score DESC) FROM (
        SELECT entity_id, score FROM artist_by_user a2 WHERE a2.user_id = artist_by_user.user_id ORDER BY score DESC LIMIT 50
      ) a) AS top_list
    FROM artist_by_user
    GROUP BY user_id
  ),
  venue_by_user AS (
    SELECT user_id, entity_id, sum(public.decay_weight(ups.signal_type::text, ups.signal_weight, ups.occurred_at))::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.entity_type = 'venue' AND ups.entity_id IS NOT NULL
    GROUP BY ups.user_id, ups.entity_id
  ),
  venue_agg AS (
    SELECT
      user_id,
      jsonb_object_agg(entity_id::text, score) AS scores,
      (SELECT array_agg(v.entity_id ORDER BY v.score DESC) FROM (
        SELECT entity_id, score FROM venue_by_user v2 WHERE v2.user_id = venue_by_user.user_id ORDER BY score DESC LIMIT 50
      ) v) AS top_list
    FROM venue_by_user
    GROUP BY user_id
  ),
  combined AS (
    SELECT
      u.uid AS user_id,
      ss.last_signal_at,
      ss.signal_count,
      COALESCE(ga.scores, '{}'::jsonb) AS genre_preference_scores,
      COALESCE(ga.top_list, '{}'::text[]) AS top_genres,
      COALESCE(aa.scores, '{}'::jsonb) AS artist_preference_scores,
      COALESCE(aa.top_list, '{}'::uuid[]) AS top_artists,
      COALESCE(va.scores, '{}'::jsonb) AS venue_preference_scores,
      COALESCE(va.top_list, '{}'::uuid[]) AS top_venues
    FROM users_to_refresh u
    LEFT JOIN sig_stats ss ON ss.user_id = u.uid
    LEFT JOIN genre_agg ga ON ga.user_id = u.uid
    LEFT JOIN artist_agg aa ON aa.user_id = u.uid
    LEFT JOIN venue_agg va ON va.user_id = u.uid
  )
  INSERT INTO public.user_preferences (
    user_id, genre_preference_scores, artist_preference_scores, venue_preference_scores,
    top_genres, top_artists, top_venues, last_signal_at, signal_count, last_computed_at, updated_at
  )
  SELECT
    c.user_id, c.genre_preference_scores, c.artist_preference_scores, c.venue_preference_scores,
    c.top_genres, c.top_artists, c.top_venues, c.last_signal_at, COALESCE(c.signal_count, 0), now(), now()
  FROM combined c
  ON CONFLICT (user_id) DO UPDATE SET
    genre_preference_scores = EXCLUDED.genre_preference_scores,
    artist_preference_scores = EXCLUDED.artist_preference_scores,
    venue_preference_scores = EXCLUDED.venue_preference_scores,
    top_genres = EXCLUDED.top_genres,
    top_artists = EXCLUDED.top_artists,
    top_venues = EXCLUDED.top_venues,
    last_signal_at = EXCLUDED.last_signal_at,
    signal_count = EXCLUDED.signal_count,
    last_computed_at = now(),
    updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- =============================================================================
-- VERIFY (run after the recompute + cache clear above)
-- =============================================================================
-- Every key should now be lowercase-hyphenated, and in_idf_vocab should be true
-- for the ones that matter. Anything still false is a genre no event carries.
--
-- SELECT k.key AS score_key,
--        EXISTS (SELECT 1 FROM public.genre_idf gi WHERE gi.genre_slug = k.key) AS in_idf_vocab,
--        round((p.genre_preference_scores->>k.key)::numeric, 2) AS score
-- FROM public.user_preferences p
-- JOIN public.users u ON u.user_id = p.user_id
-- CROSS JOIN LATERAL jsonb_object_keys(p.genre_preference_scores::jsonb) AS k(key)
-- WHERE u.username = 'tejpatel1510'
-- ORDER BY score DESC NULLS LAST
-- LIMIT 25;
