-- =============================================================================
-- Reviews -> preference signals  (the gap: your concert history never counted)
-- =============================================================================
-- REVIEW THIS, THEN APPLY IT YOURSELF. Nothing here is auto-applied.
--
-- ── THE GAP ──────────────────────────────────────────────────────────────────
-- decay_weight() has had a 730-day half-life tier for review / event_review /
-- event_attendance / artist_review / venue_review since 20260802120000 -- the longest
-- tier in the function, longer than a follow. It was designed for exactly this: a show
-- you actually went to is the strongest, longest-lasting taste signal there is.
--
-- Nothing has ever written one. Grep the repo: reviews has no trigger, and no client
-- writes a review-sourced row into user_preference_signals. Every review anyone has ever
-- left contributes ZERO to genre_preference_scores and ZERO to artist_preference_scores.
--
-- So "my profile should be a lot of house/EDM because I have gone to a lot of those
-- recently" was never expressible. The ranker only knew what you follow, what you added
-- to a bucket list, and what you stream. Where you actually went was invisible to it.
--
-- Web has papered over half of this client-side (artistAffinityService boosts events by
-- reviewed artist), mobile did not, and neither could ever surface a SIMILAR artist --
-- a name-level boost only matches the exact artist again.
--
-- ── WHAT THIS ADDS ───────────────────────────────────────────────────────────
-- Per published review with a resolvable artist:
--   * one artist signal   -> artist_preference_scores -> artist_sum (that artist again)
--   * one signal per genre of that artist -> genre_preference_scores -> genre_sum
--     (SIMILAR artists: review six house acts and `house`/`edm` climb, so house acts you
--      have never heard of start ranking above rock acts you also have not heard of)
--
-- Both use signal_type 'artist_review', so both decay on the 730-day tier.
--
-- occurred_at is the SHOW date, not the row's insert time, so decay measures how recently
-- you actually went. At a 730-day half-life a show last month keeps ~97% of its weight and
-- one from two years ago keeps ~50% -- recent scenes lead, old ones fade without vanishing.
--
-- Weight scales with the rating and a mediocre review contributes nothing:
--     weight = GREATEST(rating - 2.5, 0) * 8.0   ->  5.0 = 20.0, 4.0 = 12.0, 3.0 = 4.0,
--                                                    2.5 and below = 0 (no signal at all)
--
-- 8.0 is CALIBRATED, not picked. The first pass shipped 1.2 -- chosen against a follow
-- (2.0) -- and was measured live: it moved the reviewed user's `edm` from 90.82 to 100.31
-- against a `hip-hop-rap` base of 130.11. Attendance shifted the score by 8% and still lost
-- to streaming. Wrong reference class: Spotify writes a signal per top artist per time
-- range, so streaming arrives in hundreds of rows, while you attend maybe ten shows a year.
-- Scarcity is the entire point of the signal, so per-row weight has to carry it.
--
-- Solved against that user's real numbers (edm review base 8.61 before the multiplier,
-- non-review edm 89.98, and hip-hop-rap carries no reviews at all):
--     edm total(M) = 89.98 + 8.61M   ->  M > 4.66 overtakes hip-hop
--                                        M = 8.0 gives edm 158.9 vs hip-hop 130.1
-- which is the requested shape: house/EDM leading, hip-hop and indie still present.
--
-- Side effect, intended: their Hypertechno / Hard Techno / Techno tags go 0.84 -> 5.6.
-- Small raw numbers, but those are rare tags carrying a high genre_idf.idf_norm, so they
-- clear the IDF-weighted floor in 20260910010000 and start distinguishing one electronic
-- act from another instead of being rounded away.
--
-- TUNE HERE, same arithmetic: re-run SECTION 4a, divide a genre's decayed_weight by the
-- current multiplier to recover its base, then solve for the total you want.
--
-- ── WHAT auto_generate_genre_signals DOES TO THESE ROWS ──────────────────────
-- It is a BEFORE INSERT trigger on user_preference_signals, and it touches every row
-- written below. Two behaviours worth knowing before you read SECTION 4a and think
-- something is broken:
--   1. If genre IS NOT NULL it rewrites it through resolve_genre_to_canonical. The
--      lower(btrim(...)) below therefore lands stored as 'Edm', not 'edm'. Harmless --
--      refresh_user_preferences_v5 runs genre_match_slug over it on the way out, which is
--      why user_preferences keys come back as proper slugs.
--   2. If genre IS NULL and entity_type = 'artist' it picks ONE genre out of
--      artists_genres (ORDER BY cluster_path_slug NULLS LAST, LIMIT 1) and assigns it.
--      So the artist row inserted below ALSO carries a genre, meaning the artist's primary
--      genre counts twice per review and their secondary tags once.
-- (2) is pre-existing behaviour for every artist signal in the system -- follows, bucket
-- list, Spotify -- not something this file introduces, and the multiplier above was solved
-- against measured output, so it is already priced in.
--
-- ── NOT INCLUDED, ON PURPOSE ─────────────────────────────────────────────────
--   * venue signals. venue_preference_scores is computed but get_personalized_feed_v5
--     never reads it -- there is no venue_sum term. Writing them would be dead weight.
--   * user_event_relationships 'going' as an attendance signal. Reviews carry was_there
--     and already cover it, and prod has effectively no 'going' rows to backfill from.
--   * user_created_artist_id reviews. Those point at user-submitted artists with no
--     genres row, so there is nothing to derive similarity from.
--   * a was_there = true filter. Every reviewed show in prod is one the user attended;
--     add `AND COALESCE(r.was_there, true)` below if that stops being true.
-- =============================================================================


-- ===========================================================================
-- SECTION 0 - VERIFIED LIVE 2026-09-10. Kept for the record; re-run if the
-- schema has moved since. Nothing below depends on you running it again.
-- ===========================================================================
-- Results on 2026-09-10:
--   * reviews has id / user_id / artist_id / rating / artist_performance_rating /
--     is_draft / was_there / created_at, plus "Event_date" -- genuinely capitalised in
--     this schema, and typed `date NOT NULL`. created_at is `timestamptz NOT NULL`.
--     Both casts below are therefore total; no fallback needed.
--   * preference_signal_type includes 'artist_review' (730-day half-life in
--     decay_weight) alongside artist_manual_preference, bucket_list, event_attendance,
--     genre_manual_preference and review. 'artist_review' is the longest-lived match,
--     so that is what this file writes for BOTH the artist row and the genre rows.
--   * Blast radius: 52 reviews carry an artist_id, 50 of them clear the rating floor,
--     across 8 users, and all 52 of those artists have usable genres.

-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'reviews'
--   AND column_name IN ('id','user_id','artist_id','user_created_artist_id','venue_id',
--                       'rating','artist_performance_rating','is_draft','was_there',
--                       'Event_date','created_at')
-- ORDER BY column_name;

-- SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
-- WHERE t.typname = 'preference_signal_type' ORDER BY 1;

-- SELECT count(*) FILTER (WHERE r.artist_id IS NOT NULL) AS reviews_with_artist,
--        count(*) FILTER (WHERE r.artist_id IS NOT NULL
--                           AND COALESCE(r.is_draft, false) = false
--                           AND GREATEST(COALESCE(r.rating, r.artist_performance_rating, 0) - 2.5, 0) > 0)
--                                                        AS will_signal,
--        count(DISTINCT r.user_id) FILTER (WHERE r.artist_id IS NOT NULL) AS users_affected
-- FROM public.reviews r;


-- ===========================================================================
-- SECTION 1 - trigger function
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.process_review_to_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- Rating -> weight. See the header for how 8.0 was solved for rather than guessed;
  -- raise 2.5 to demand a better review before it counts at all.
  v_weight   numeric := GREATEST(COALESCE(NEW.rating, NEW.artist_performance_rating, 0) - 2.5, 0) * 8.0;
  -- Decay from the NIGHT OF THE SHOW, not from when the review was typed. "Event_date" is
  -- `date NOT NULL`, so this cast is total. LEAST() because a future-dated show is not
  -- attendance yet -- without it, a show six months out would decay as if it had happened.
  v_occurred timestamptz := LEAST(NEW."Event_date"::timestamptz, now());
BEGIN
  IF NEW.artist_id IS NULL OR COALESCE(NEW.is_draft, false) THEN
    RETURN NEW;
  END IF;

  -- Replace rather than skip: an edited rating must move the weight, and the review
  -- wizard writes a draft then republishes, so this fires more than once per review.
  DELETE FROM public.user_preference_signals s
  WHERE s.user_id = NEW.user_id
    AND s.context->>'source' = 'review'
    AND s.context->>'review_id' = NEW.id::text;

  IF v_weight <= 0 THEN
    RETURN NEW;   -- 2.5 stars or worse: the delete above is the whole effect
  END IF;

  -- The artist themselves -> artist_sum, weighted 16x in the ranker.
  INSERT INTO public.user_preference_signals
    (user_id, signal_type, entity_type, entity_id, signal_weight, context, occurred_at)
  VALUES
    (NEW.user_id, 'artist_review', 'artist', NEW.artist_id, v_weight,
     jsonb_build_object('source', 'review', 'review_id', NEW.id, 'artist_id', NEW.artist_id),
     v_occurred);

  -- That artist's genres -> genre_sum, which is what carries similarity to artists the
  -- user has never heard of.
  INSERT INTO public.user_preference_signals
    (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
  SELECT NEW.user_id, 'artist_review', 'genre', lower(btrim(g.genre)), v_weight,
         jsonb_build_object('source', 'review', 'review_id', NEW.id, 'artist_id', NEW.artist_id),
         v_occurred
  FROM public.artists a
  CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
  WHERE a.id = NEW.artist_id
    AND a.genres IS NOT NULL
    AND array_length(a.genres, 1) > 0
    AND btrim(g.genre) <> ''
    AND lower(btrim(g.genre)) <> 'small artist';   -- artists.genres empty-state sentinel

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Leaving a review must never fail because signal derivation failed.
  RAISE WARNING 'process_review_to_signals failed for %/%: %', NEW.user_id, NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

-- Trigger functions do not need an EXECUTE grant to fire. Revoke FROM PUBLIC, not FROM
-- anon: revoking from anon is a no-op when the grant arrived via PUBLIC.
REVOKE ALL ON FUNCTION public.process_review_to_signals() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_review_signals ON public.reviews;
CREATE TRIGGER trg_review_signals
  AFTER INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.process_review_to_signals();


-- Retracting a review has to retract its taste too. context is jsonb, so no foreign key
-- can do this -- without it a deleted 5-star review leaves a weight-3.0 ghost, the
-- heaviest signal in the system, attached to an artist the user disowned.
CREATE OR REPLACE FUNCTION public.process_review_delete_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  DELETE FROM public.user_preference_signals s
  WHERE s.user_id = OLD.user_id
    AND s.context->>'source' = 'review'
    AND s.context->>'review_id' = OLD.id::text;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'process_review_delete_signals failed for %/%: %', OLD.user_id, OLD.id, SQLERRM;
  RETURN OLD;
END;
$fn$;

REVOKE ALL ON FUNCTION public.process_review_delete_signals() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_review_signals_delete ON public.reviews;
CREATE TRIGGER trg_review_signals_delete
  AFTER DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.process_review_delete_signals();


-- ===========================================================================
-- SECTION 2 - backfill the 50 existing published reviews.
-- Idempotent: the DELETE clears this file's own prior rows first, keyed on
-- context->>'review_id', so re-running is safe and self-correcting.
-- Run all three statements together.
-- ===========================================================================

DELETE FROM public.user_preference_signals s
USING public.reviews r
WHERE s.user_id = r.user_id
  AND s.context->>'source' = 'review'
  AND s.context->>'review_id' = r.id::text;

INSERT INTO public.user_preference_signals
  (user_id, signal_type, entity_type, entity_id, signal_weight, context, occurred_at)
SELECT r.user_id, 'artist_review', 'artist', r.artist_id,
       GREATEST(COALESCE(r.rating, r.artist_performance_rating, 0) - 2.5, 0) * 8.0,
       jsonb_build_object('source', 'review', 'review_id', r.id, 'artist_id', r.artist_id),
       LEAST(r."Event_date"::timestamptz, now())
FROM public.reviews r
WHERE r.artist_id IS NOT NULL
  AND COALESCE(r.is_draft, false) = false
  AND GREATEST(COALESCE(r.rating, r.artist_performance_rating, 0) - 2.5, 0) > 0;

INSERT INTO public.user_preference_signals
  (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
SELECT r.user_id, 'artist_review', 'genre', lower(btrim(g.genre)),
       GREATEST(COALESCE(r.rating, r.artist_performance_rating, 0) - 2.5, 0) * 8.0,
       jsonb_build_object('source', 'review', 'review_id', r.id, 'artist_id', r.artist_id),
       LEAST(r."Event_date"::timestamptz, now())
FROM public.reviews r
JOIN public.artists a ON a.id = r.artist_id
CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
WHERE r.artist_id IS NOT NULL
  AND COALESCE(r.is_draft, false) = false
  AND GREATEST(COALESCE(r.rating, r.artist_performance_rating, 0) - 2.5, 0) > 0
  AND a.genres IS NOT NULL
  AND array_length(a.genres, 1) > 0
  AND btrim(g.genre) <> ''
  AND lower(btrim(g.genre)) <> 'small artist';


-- ===========================================================================
-- SECTION 3 - recompute + clear cache. Signals do nothing until this runs, and
-- a recomputed preference vector does not touch already-cached feed rows.
-- ===========================================================================
SELECT public.refresh_user_preferences_v5(NULL);
DELETE FROM public.personalized_feed_cache;


-- ===========================================================================
-- SECTION 4 - verify.
-- ===========================================================================

-- 4a. What the reviews contributed, on their own.
SELECT s.genre,
       count(*) AS review_rows,
       round(sum(public.decay_weight(s.signal_type::text, s.signal_weight, s.occurred_at)), 2) AS decayed_weight
FROM public.user_preference_signals s
JOIN public.users u ON u.user_id = s.user_id
WHERE u.username = 'tejpatel1510'
  AND s.context->>'source' = 'review'
  AND s.genre IS NOT NULL
GROUP BY s.genre
ORDER BY decayed_weight DESC
LIMIT 20;

-- 4b. Your top genres overall, now that attendance is counted. House/EDM should have
-- climbed relative to the streaming-derived genres if that is where you have been going.
SELECT k.key AS genre_slug,
       round((p.genre_preference_scores->>k.key)::numeric, 2) AS score,
       EXISTS (SELECT 1 FROM public.genre_idf gi WHERE gi.genre_slug = k.key) AS in_idf_vocab
FROM public.user_preferences p
JOIN public.users u ON u.user_id = p.user_id
CROSS JOIN LATERAL jsonb_object_keys(p.genre_preference_scores::jsonb) AS k(key)
WHERE u.username = 'tejpatel1510'
ORDER BY score DESC NULLS LAST
LIMIT 25;

-- 4c. Artists you reviewed should now carry real artist_preference_scores weight.
SELECT a.name,
       round((p.artist_preference_scores->>k.key)::numeric, 2) AS score
FROM public.user_preferences p
JOIN public.users u ON u.user_id = p.user_id
CROSS JOIN LATERAL jsonb_object_keys(p.artist_preference_scores::jsonb) AS k(key)
JOIN public.artists a ON a.id = k.key::uuid
WHERE u.username = 'tejpatel1510'
ORDER BY score DESC NULLS LAST
LIMIT 15;
