-- Ready to run. SECTION 0 of 05_bucket_list_signals.REVIEW.sql was verified live
-- on 2026-09-09:
--   * 'bucket_list' IS a valid preference_signal_type (decay_weight already gives it a
--     90-day half-life -- this signal was designed for and never wired up).
--   * bucket_list has rank_order, entity_id, entity_name.
--   * entities exposes entity_type / entity_uuid for resolving entry -> artist.
--   * Measured impact: 12 resolvable entries across 3 users (4 unresolvable -- venue
--     entries and orphans, correctly skipped).
--
-- Small blast radius. This makes the bucket list a ranking SIGNAL rather than a pinned
-- client-side block: an artist signal (-> artist_preference_scores -> artist_sum) plus
-- genre signals from that artist's genres (-> genre_preference_scores -> genre_sum, so
-- similar artists surface too).
--
-- Run this whole file, then the single recompute + cache clear (see the chat instructions
-- or 04's SECTION 3) -- do NOT run a recompute in between if you are also applying
-- 20260909000000_fix_genre_score_key_mismatch.sql; one pass at the end covers both.
--
-- DEPLOY ORDER: this must be live BEFORE the web build that removes the bucket-list
-- pinning from UnifiedEventsFeed, or bucket-list events lose their slot entirely.

CREATE OR REPLACE FUNCTION public.process_bucket_list_to_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_artist_id uuid;
  -- Rank 1 matters more than rank 10, but never so much that a low-ranked entry stops
  -- counting. TUNE HERE: raise the base to make the bucket list dominate more.
  v_weight numeric := GREATEST(1.6 - 0.1 * COALESCE(NEW.rank_order, 10), 0.6);
BEGIN
  SELECT a.id INTO v_artist_id
  FROM public.entities en
  JOIN public.artists a ON a.id = en.entity_uuid
  WHERE en.id = NEW.entity_id AND en.entity_type = 'artist';

  IF v_artist_id IS NULL THEN
    RETURN NEW;   -- venue entries and unresolvable rows are simply not artist signals
  END IF;

  -- The artist itself: drives artist_sum, so their shows rank up on merit.
  INSERT INTO public.user_preference_signals
    (user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, context, occurred_at)
  SELECT NEW.user_id, 'bucket_list', 'artist', v_artist_id, NEW.entity_name, v_weight,
         jsonb_build_object('source', 'bucket_list', 'bucket_list_id', NEW.id), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_preference_signals s
    WHERE s.user_id = NEW.user_id
      AND s.entity_type = 'artist'
      AND s.entity_id = v_artist_id
      AND s.context->>'source' = 'bucket_list'
  );

  -- That artist's genres: drives genre_sum, so SIMILAR artists surface too.
  INSERT INTO public.user_preference_signals
    (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
  SELECT NEW.user_id, 'genre_manual_preference', 'genre', lower(btrim(g.genre)), v_weight,
         jsonb_build_object('source', 'bucket_list', 'artist_id', v_artist_id), now()
  FROM public.artists a
  CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
  WHERE a.id = v_artist_id
    AND a.genres IS NOT NULL
    AND array_length(a.genres, 1) > 0
    AND btrim(g.genre) <> ''
    AND lower(btrim(g.genre)) <> 'small artist'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_preference_signals s
      WHERE s.user_id = NEW.user_id
        AND s.genre = lower(btrim(g.genre))
        AND s.context->>'artist_id' = v_artist_id::text
    );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Adding to the bucket list must never fail because signal derivation failed.
  RAISE WARNING 'process_bucket_list_to_signals failed for %/%: %', NEW.user_id, NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.process_bucket_list_to_signals() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_bucket_list_signals ON public.bucket_list;
CREATE TRIGGER trg_bucket_list_signals
  AFTER INSERT ON public.bucket_list
  FOR EACH ROW EXECUTE FUNCTION public.process_bucket_list_to_signals();

===========================================================================
SECTION 2 - backfill existing bucket lists. Idempotent.
===========================================================================

WITH resolved AS (
  SELECT bl.id, bl.user_id, bl.entity_name, a.id AS artist_id, a.genres,
         GREATEST(1.6 - 0.1 * COALESCE(bl.rank_order, 10), 0.6) AS weight
  FROM public.bucket_list bl
  JOIN public.entities en ON en.id = bl.entity_id AND en.entity_type = 'artist'
  JOIN public.artists a ON a.id = en.entity_uuid
)
INSERT INTO public.user_preference_signals
  (user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, context, occurred_at)
SELECT r.user_id, 'bucket_list', 'artist', r.artist_id, r.entity_name, r.weight,
       jsonb_build_object('source', 'bucket_list', 'bucket_list_id', r.id), now()
FROM resolved r
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_preference_signals s
  WHERE s.user_id = r.user_id AND s.entity_type = 'artist'
    AND s.entity_id = r.artist_id AND s.context->>'source' = 'bucket_list'
);

WITH resolved AS (
  SELECT bl.user_id, a.id AS artist_id, a.genres,
         GREATEST(1.6 - 0.1 * COALESCE(bl.rank_order, 10), 0.6) AS weight
  FROM public.bucket_list bl
  JOIN public.entities en ON en.id = bl.entity_id AND en.entity_type = 'artist'
  JOIN public.artists a ON a.id = en.entity_uuid
)
INSERT INTO public.user_preference_signals
  (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
SELECT r.user_id, 'genre_manual_preference', 'genre', lower(btrim(g.genre)), r.weight,
       jsonb_build_object('source', 'bucket_list', 'artist_id', r.artist_id), now()
FROM resolved r
CROSS JOIN LATERAL unnest(r.genres) AS g(genre)
WHERE r.genres IS NOT NULL AND array_length(r.genres, 1) > 0
  AND btrim(g.genre) <> '' AND lower(btrim(g.genre)) <> 'small artist'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_preference_signals s
    WHERE s.user_id = r.user_id AND s.genre = lower(btrim(g.genre))
      AND s.context->>'artist_id' = r.artist_id::text
  );

