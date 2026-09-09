-- Ready to run. Assumptions in 03_artist_genre_signals.REVIEW.sql SECTION 0 were verified
-- against the live DB on 2026-09-09:
--   * user_preference_signals has user_id, signal_type, entity_type, genre, signal_weight,
--     context, occurred_at (entity_id / entity_name are nullable and intentionally unset -
--     entity_type is 'genre' here, and there is no genre entity table to point at).
--   * 'genre_manual_preference' is a valid preference_signal_type; 'genre' is a valid
--     preference_entity_type.
--   * artists.genres is _text (text[]).
--   * Impact measured: 23 users, 245 signal rows.
--
-- Run STEP 1 and STEP 2 together, then STEP 3 separately (it is slower), then STEP 4.

-- ===========================================================================
-- STEP 1 - trigger function
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.process_artist_follow_to_genre_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.user_preference_signals
    (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
  SELECT NEW.user_id,
         'genre_manual_preference',
         'genre',
         lower(btrim(g.genre)),
         0.6,   -- below a hand-picked genre (1.0): inferred from a follow, not stated
         jsonb_build_object('source', 'artist_follow', 'artist_id', NEW.artist_id),
         now()
  FROM public.artists a
  CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
  WHERE a.id = NEW.artist_id
    AND a.genres IS NOT NULL
    AND array_length(a.genres, 1) > 0
    AND btrim(g.genre) <> ''
    AND lower(btrim(g.genre)) <> 'small artist'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_preference_signals s
      WHERE s.user_id = NEW.user_id
        AND s.genre = lower(btrim(g.genre))
        AND s.context->>'artist_id' = NEW.artist_id::text
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A follow must never fail because signal derivation failed. Onboarding's final step
  -- depends on the artist_follows insert succeeding.
  RAISE WARNING 'process_artist_follow_to_genre_signals failed for %/%: %',
                NEW.user_id, NEW.artist_id, SQLERRM;
  RETURN NEW;
END;
$fn$;

-- Trigger functions do not need an EXECUTE grant to fire. Revoke FROM PUBLIC, not FROM
-- anon: revoking from anon is a no-op when the grant arrived via PUBLIC.
REVOKE ALL ON FUNCTION public.process_artist_follow_to_genre_signals() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_artist_follow_genre_signals ON public.artist_follows;
CREATE TRIGGER trg_artist_follow_genre_signals
  AFTER INSERT ON public.artist_follows
  FOR EACH ROW EXECUTE FUNCTION public.process_artist_follow_to_genre_signals();

-- ===========================================================================
-- STEP 2 - backfill the 245 rows for existing follows. Idempotent.
-- ===========================================================================
INSERT INTO public.user_preference_signals
  (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
SELECT af.user_id, 'genre_manual_preference', 'genre',
       lower(btrim(g.genre)), 0.6,
       jsonb_build_object('source', 'artist_follow', 'artist_id', af.artist_id),
       now()
FROM public.artist_follows af
JOIN public.artists a ON a.id = af.artist_id
CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
WHERE a.genres IS NOT NULL
  AND array_length(a.genres, 1) > 0
  AND btrim(g.genre) <> ''
  AND lower(btrim(g.genre)) <> 'small artist'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_preference_signals s
    WHERE s.user_id = af.user_id
      AND s.genre = lower(btrim(g.genre))
      AND s.context->>'artist_id' = af.artist_id::text
  );

-- ===========================================================================
-- STEP 3 - recompute preferences. Run separately; only the ~23 affected users.
-- Signals do nothing until this turns them into genre_preference_scores.
-- ===========================================================================
SELECT public.refresh_user_preferences_v5(u.user_id)
FROM public.users u
WHERE coalesce(u.is_bot, false) = false
  AND EXISTS (SELECT 1 FROM public.artist_follows af WHERE af.user_id = u.user_id);

-- ===========================================================================
-- STEP 3b - invalidate the cached feeds for those users, or none of this is
-- visible. A recomputed preference vector does not touch already-cached feed
-- rows, so without this the change reads as a no-op from the app.
-- Only the affected users, so the recompute cost stays bounded.
-- ===========================================================================
DELETE FROM public.personalized_feed_cache c
WHERE EXISTS (
  SELECT 1 FROM public.artist_follows af WHERE af.user_id = c.user_id
);

-- ===========================================================================
-- STEP 4 - verify. These six had 0 genres before; they should now have several.
-- ===========================================================================
SELECT u.username,
       CASE WHEN jsonb_typeof(p.genre_preference_scores::jsonb) = 'object'
            THEN (SELECT count(*) FROM jsonb_object_keys(p.genre_preference_scores::jsonb))
            ELSE 0 END AS genre_count
FROM public.users u
LEFT JOIN public.user_preferences p ON p.user_id = u.user_id
WHERE u.username IN ('brettwitcher','herbyhabecker','mrrogersyo','joshbaim',
                     'andrewpeters7','eliabellera')
ORDER BY genre_count;
