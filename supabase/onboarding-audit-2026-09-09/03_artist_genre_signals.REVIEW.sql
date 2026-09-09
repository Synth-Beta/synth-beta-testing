-- REVIEW ONLY. Nothing here is applied. Run SECTION 0 first and confirm the assumptions
-- before running anything else.
--
-- PROBLEM: mobile onboarding never collects genres. OnboardingService.saveGenres() in
-- mobile/src/services/onboardingService.ts has zero call sites; the "scene" step is a DC
-- room picker, not a genre picker. Genres were meant to arrive from the streaming-connect
-- step, which is skippable. Every mobile-onboarded user checked has streaming_connected=0
-- and an empty genre_preference_scores, so get_personalized_feed_v5 runs for them with no
-- genre vector at all.
--
-- FIX: derive genre signals from the artists they already follow. Onboarding requires 3,
-- artists.genres is ~93.7% populated, and following an artist genuinely is a genre
-- preference. No new UI, and it fixes web and mobile at once.
--
-- DELIBERATE CHOICE: reuses the existing 'genre_manual_preference' signal_type rather than
-- adding an enum value, so these rows flow through refresh_user_preferences_v5 unchanged
-- with zero function edits. Provenance is recorded in context->>'source' = 'artist_follow'
-- so they stay distinguishable from real manual picks.

-- ===========================================================================
-- SECTION 0 - VERIFY ASSUMPTIONS. Read-only. Confirm all four before proceeding.
-- ===========================================================================

-- 0a. user_preference_signals columns must include: user_id, signal_type, entity_type,
--     genre, signal_weight, context, occurred_at.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_preference_signals'
ORDER BY ordinal_position;

-- 0b. 'genre_manual_preference' must be a valid signal_type value.
SELECT t.typname, e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE e.enumlabel LIKE '%genre%'
ORDER BY t.typname, e.enumsortorder;

-- 0c. artists.genres must be an array type.
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'artists' AND column_name = 'genres';

-- 0d. How much signal this would actually create, and for how many users.
--     'small artist' is excluded alongside NULL and '{}' because artists.genres has three
--     distinct empty states, and a backfill that ignores any of them never converges.
SELECT count(DISTINCT af.user_id) AS users_gaining_signal,
       count(*)                   AS signal_rows_to_create
FROM public.artist_follows af
JOIN public.artists a ON a.id = af.artist_id
CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
WHERE a.genres IS NOT NULL
  AND array_length(a.genres, 1) > 0
  AND btrim(g.genre) <> ''
  AND lower(btrim(g.genre)) <> 'small artist';

-- ===========================================================================
-- SECTION 1 - THE TRIGGER. Everything below is commented out.
-- ===========================================================================

-- CREATE OR REPLACE FUNCTION public.process_artist_follow_to_genre_signals()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp   -- pinned: unqualified names must not resolve via caller's path
-- AS $fn$
-- BEGIN
--   INSERT INTO public.user_preference_signals
--     (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
--   SELECT NEW.user_id,
--          'genre_manual_preference',
--          'genre',
--          lower(btrim(g.genre)),
--          0.6,   -- below a hand-picked genre (1.0): inferred, not stated
--          jsonb_build_object('source', 'artist_follow', 'artist_id', NEW.artist_id),
--          now()
--   FROM public.artists a
--   CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
--   WHERE a.id = NEW.artist_id
--     AND a.genres IS NOT NULL
--     AND array_length(a.genres, 1) > 0
--     AND btrim(g.genre) <> ''
--     AND lower(btrim(g.genre)) <> 'small artist'
--     -- Idempotent: re-following an artist must not double-count the genre.
--     AND NOT EXISTS (
--       SELECT 1 FROM public.user_preference_signals s
--       WHERE s.user_id = NEW.user_id
--         AND s.genre = lower(btrim(g.genre))
--         AND s.context->>'artist_id' = NEW.artist_id::text
--     );
--   RETURN NEW;
-- EXCEPTION WHEN OTHERS THEN
--   -- A follow must never fail because signal derivation failed. Onboarding's final
--   -- step depends on this insert succeeding.
--   RAISE WARNING 'process_artist_follow_to_genre_signals failed for %/%: %',
--                 NEW.user_id, NEW.artist_id, SQLERRM;
--   RETURN NEW;
-- END;
-- $fn$;

-- REVOKE ALL ON FUNCTION public.process_artist_follow_to_genre_signals() FROM PUBLIC;
-- -- REVOKE FROM anon is a no-op when the grant arrived via PUBLIC; revoke FROM PUBLIC.

-- DROP TRIGGER IF EXISTS trg_artist_follow_genre_signals ON public.artist_follows;
-- CREATE TRIGGER trg_artist_follow_genre_signals
--   AFTER INSERT ON public.artist_follows
--   FOR EACH ROW EXECUTE FUNCTION public.process_artist_follow_to_genre_signals();

-- ===========================================================================
-- SECTION 2 - BACKFILL existing follows. Run once, after the trigger exists.
-- Idempotent via the same NOT EXISTS guard.
-- ===========================================================================

-- INSERT INTO public.user_preference_signals
--   (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
-- SELECT af.user_id, 'genre_manual_preference', 'genre',
--        lower(btrim(g.genre)), 0.6,
--        jsonb_build_object('source', 'artist_follow', 'artist_id', af.artist_id),
--        now()
-- FROM public.artist_follows af
-- JOIN public.artists a ON a.id = af.artist_id
-- CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
-- WHERE a.genres IS NOT NULL
--   AND array_length(a.genres, 1) > 0
--   AND btrim(g.genre) <> ''
--   AND lower(btrim(g.genre)) <> 'small artist'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.user_preference_signals s
--     WHERE s.user_id = af.user_id
--       AND s.genre = lower(btrim(g.genre))
--       AND s.context->>'artist_id' = af.artist_id::text
--   );

-- ===========================================================================
-- SECTION 3 - Recompute preferences, then verify. Signals alone change nothing
-- until refresh_user_preferences_v5 turns them into genre_preference_scores,
-- and the feed cache must be cleared or the change stays invisible.
-- ===========================================================================

-- SELECT public.refresh_user_preferences_v5(u.user_id)
-- FROM public.users u
-- WHERE coalesce(u.is_bot, false) = false
--   AND EXISTS (SELECT 1 FROM public.artist_follows af WHERE af.user_id = u.user_id);

-- Verify: the mobile-onboarded users who had 0 genres should now have several.
-- SELECT u.username,
--        CASE WHEN jsonb_typeof(p.genre_preference_scores::jsonb) = 'object'
--             THEN (SELECT count(*) FROM jsonb_object_keys(p.genre_preference_scores::jsonb))
--             ELSE 0 END AS genre_count
-- FROM public.users u
-- LEFT JOIN public.user_preferences p ON p.user_id = u.user_id
-- WHERE u.username IN ('brettwitcher','herbyhabecker','mrrogersyo','joshbaim',
--                      'andrewpeters7','eliabellera')
-- ORDER BY genre_count;
