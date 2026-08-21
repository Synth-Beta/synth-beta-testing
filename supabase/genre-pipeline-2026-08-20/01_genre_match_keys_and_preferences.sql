-- ============================================================================
-- 01 — Make user genre preferences actually match event genre tags.
-- ============================================================================
--
-- THE BUG
-- -------
-- refresh_user_preferences_v5 canonicalises each signal's genre to genres.name
-- (Title Case: "Folk", "Jam Band", "Hip Hop Rap") and stores that as the KEY of
-- user_preferences.genre_preference_scores.
--
-- get_personalized_feed_v5 then scores an event by looking those keys up
-- against the raw strings in events.genres, which are slug-cased
-- ("folk", "jamband", "hip-hop-rap"). Its variant expression only ever
-- transforms the EVENT side:
--     unnest(ARRAY[g.genre, LOWER(g.genre), REPLACE(g.genre, ' ', '')])
-- so "folk" never becomes "Folk" and the lookup misses.
--
-- MEASURED IMPACT (live, 2026-08-20, all 66 users with non-empty preferences,
-- against a 40k sample of upcoming events):
--   * genre boost currently reaches 0.0%-1.1% of events (median 0.9%)
--   * matched case-insensitively it reaches 5.8%-48.4% (median ~22%)
--   * worse: the ~0.9% that DO match are almost entirely the mis-tagged rows
--     cleaned up in 02_. A user who likes "Folk" gets 42 events boosted, all 42
--     of them mis-tagged, while 530 genuinely-folk events get no boost at all.
--     Genre personalisation is not merely weak today, it is inverted.
--
-- THE FIX
-- -------
-- Key genre_preference_scores by genres.slug instead of genres.name. slug is
-- already exactly the format events.genres stores ("hip-hop-rap",
-- "country-music", "folk"), so the EXISTING variant expression in
-- get_personalized_feed_v5 matches with no change to that 310-line function --
-- deliberately kept out of scope here to keep the blast radius small.
--
-- top_genres keeps the human-readable genres.name values, so UI that displays
-- taste ("Hip Hop Rap", not "hip-hop-rap") reads from there. The companion app
-- change in packages/synth-shared/src/streamingStatsCore.ts makes the Streaming
-- Stats page prefer top_genres for labels rather than the score map's keys.
--
-- Note: "Jam Band" (slug "jam-band") and "Jamband" (slug "jamband") are two
-- separate rows in genres, so they still will not collapse onto the "jamband"
-- event tag until 04_ merges them. Run 04 as well.

BEGIN;

-- Slug form of an arbitrary genre string: lowercase, every run of non-
-- alphanumerics becomes a single hyphen, no leading/trailing hyphen.
-- "Hip Hop Rap" -> "hip-hop-rap"   (matches genres.slug and events.genres)
-- "hip-hop-rap" -> "hip-hop-rap"   (already slug form, unchanged)
CREATE OR REPLACE FUNCTION public.genre_match_slug(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(BOTH '-' FROM regexp_replace(lower(coalesce(p_raw, '')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

-- Lookup key matching genres.normalized_key, which uses single spaces rather
-- than hyphens. "Hip-Hop_Rap" -> "hip hop rap"
CREATE OR REPLACE FUNCTION public.genre_norm_key(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(regexp_replace(lower(coalesce(p_raw, '')), '[\s\-_]+', ' ', 'g')),
    ''
  );
$$;

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
    -- The JOIN to public.users is a BUG FIX, not a style choice. Signals
    -- outlive the accounts that created them: 4 fully-deleted users (gone from
    -- auth.users too) left 29 orphaned rows in user_preference_signals dating
    -- back to 2026-03. Without this JOIN the INSERT below tries to write a
    -- user_preferences row for a user_id that no longer exists in public.users
    -- and dies on user_preferences_new_user_id_fkey1:
    --   ERROR 23503: Key (user_id)=(99e9eb67-...) is not present in table "users"
    -- Because that aborts the whole statement, a full refresh
    -- (p_user_id IS NULL) has been failing outright since the first orphan
    -- appeared -- meaning every user's preferences have been stale for months,
    -- independently of the key-casing bug this migration set out to fix.
    -- Skipping orphans is correct: there is no account left to personalise for.
    SELECT DISTINCT ups.user_id AS uid
    FROM public.user_preference_signals ups
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
  -- CHANGED: emit two keys per signal.
  --   match_key   -> genres.slug, the form events.genres actually stores.
  --                  This is what genre_preference_scores is keyed by, and it
  --                  is what makes the feed's lookup hit.
  --   display_name-> genres.name, the human label, kept for top_genres/UI.
  -- Signals whose genre is not in the taxonomy fall back to a slugified /
  -- initcap'd form of the raw signal rather than being dropped.
  genre_by_user AS (
    SELECT
      ups.user_id,
      COALESCE(gr.slug, public.genre_match_slug(ups.genre)) AS match_key,
      COALESCE(gr.name, initcap(btrim(ups.genre)))          AS display_name,
      sum(public.decay_weight(ups.signal_type::text, ups.signal_weight, ups.occurred_at))::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    LEFT JOIN public.genres gr
      ON gr.normalized_key = public.genre_norm_key(ups.genre)
    WHERE ups.genre IS NOT NULL
      AND public.genre_match_slug(ups.genre) IS NOT NULL
    GROUP BY
      ups.user_id,
      COALESCE(gr.slug, public.genre_match_slug(ups.genre)),
      COALESCE(gr.name, initcap(btrim(ups.genre)))
  ),
  genre_agg AS (
    SELECT
      user_id,
      -- scores keyed by slug so get_personalized_feed_v5 can match them
      jsonb_object_agg(match_key, score) AS scores,
      -- top_genres keeps display names, ordered by score
      (SELECT array_agg(g.display_name ORDER BY g.score DESC) FROM (
        SELECT display_name, score FROM genre_by_user g2 WHERE g2.user_id = genre_by_user.user_id ORDER BY score DESC LIMIT 20
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

COMMIT;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ REQUIRED SECOND STEP -- THIS IS NOT OPTIONAL AND IS NOT A COMMENT.       ║
-- ║                                                                          ║
-- ║ Everything above only replaces the FUNCTION. The keys already stored in  ║
-- ║ user_preferences.genre_preference_scores are not rewritten until the     ║
-- ║ function is actually called. Until you run the line below, this entire   ║
-- ║ migration has zero effect -- preferences stay Title Case and the feed    ║
-- ║ keeps missing every event.                                               ║
-- ║                                                                          ║
-- ║ Run this now, as its own statement. Safe to re-run any time.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT public.refresh_user_preferences_v5();

-- ── VERIFY (run after the refresh above) ────────────────────────────────────
-- Expect: keys are now slug-cased, and they intersect real event tags.
--
-- SELECT user_id, jsonb_object_keys(genre_preference_scores) AS key
-- FROM public.user_preferences
-- WHERE genre_preference_scores <> '{}'::jsonb
-- LIMIT 20;
--
-- -- How many upcoming events does each user's genre profile now reach?
-- SELECT p.user_id,
--        count(*) FILTER (WHERE e.genres && ARRAY(SELECT jsonb_object_keys(p.genre_preference_scores))) AS reachable,
--        count(*) AS total
-- FROM public.user_preferences p
-- CROSS JOIN LATERAL (
--   SELECT genres FROM public.events WHERE event_date >= now() LIMIT 5000
-- ) e
-- WHERE p.genre_preference_scores <> '{}'::jsonb
-- GROUP BY p.user_id
-- ORDER BY reachable DESC
-- LIMIT 20;
