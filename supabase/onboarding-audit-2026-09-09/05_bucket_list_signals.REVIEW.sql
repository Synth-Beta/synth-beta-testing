-- REVIEW ONLY. Run SECTION 0 and confirm before running anything else.
--
-- GOAL: make the bucket list feed the recommender instead of sitting beside it.
--
-- Today the bucket list is a separate client-side fetch that PINS its top 5 above the
-- ranked feed (hoistBucketListEvents in src/components/home/UnifiedEventsFeed.tsx). The
-- feed RPC has no idea the bucket list exists, so bucket-list taste contributes nothing to
-- what else gets recommended.
--
-- This makes bucket-list entries ordinary preference signals, which is what the schema
-- already expects: public.decay_weight() ALREADY defines a 'bucket_list' signal type with a
-- 90-day half-life. It was designed for this and never wired up.
--
-- Once these rows exist, refresh_user_preferences_v5 folds them in automatically:
--   * entity_type='artist' rows  -> artist_preference_scores -> artist_sum in the ranker,
--     so a bucket-list artist's own shows rank up instead of being pinned.
--   * genre rows from that artist's genres -> genre_preference_scores -> genre_sum,
--     so SIMILAR artists in those genres start surfacing too. That is the
--     "recommend things related to the artists I like" half of the request.
--
-- Pairs with 04_artist_genre_signals (in-app follows) and the existing Spotify path
-- (process_spotify_genres_to_signals). After all three, every "artist I like" source —
-- Spotify, in-app follows, bucket list — feeds the same two score maps.

-- ===========================================================================
-- SECTION 0 - VERIFY. Read-only. All four must hold.
-- ===========================================================================

-- 0a. 'bucket_list' must be a valid preference_signal_type. If it is NOT in this list,
--     STOP: use 'artist_manual_preference' instead (180-day half-life) and tell me.
SELECT e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'preference_signal_type'
ORDER BY e.enumsortorder;

-- 0b. bucket_list shape: entity_id points at entities.id, NOT artists.id.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bucket_list'
ORDER BY ordinal_position;

-- 0c. entities linkage used to resolve an entry to a real artist row.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'entities'
  AND column_name IN ('id', 'entity_type', 'entity_uuid');

-- 0d. Impact: how many entries resolve to an artist, and how much signal that creates.
SELECT count(*) FILTER (WHERE a.id IS NOT NULL)                  AS resolvable_entries,
       count(DISTINCT bl.user_id) FILTER (WHERE a.id IS NOT NULL) AS users_affected,
       count(*) FILTER (WHERE a.id IS NULL)                       AS unresolvable_entries
FROM public.bucket_list bl
LEFT JOIN public.entities en ON en.id = bl.entity_id AND en.entity_type = 'artist'
LEFT JOIN public.artists a ON a.id = en.entity_uuid;

-- ===========================================================================
-- SECTION 1 - trigger. Commented out until SECTION 0 checks out.
-- ===========================================================================

-- CREATE OR REPLACE FUNCTION public.process_bucket_list_to_signals()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $fn$
-- DECLARE
--   v_artist_id uuid;
--   -- Rank 1 matters more than rank 10, but never so much that a low-ranked entry stops
--   -- counting. TUNE HERE: raise the base to make the bucket list dominate more.
--   v_weight numeric := GREATEST(1.6 - 0.1 * COALESCE(NEW.rank_order, 10), 0.6);
-- BEGIN
--   SELECT a.id INTO v_artist_id
--   FROM public.entities en
--   JOIN public.artists a ON a.id = en.entity_uuid
--   WHERE en.id = NEW.entity_id AND en.entity_type = 'artist';
--
--   IF v_artist_id IS NULL THEN
--     RETURN NEW;   -- venue entries and unresolvable rows are simply not artist signals
--   END IF;
--
--   -- The artist itself: drives artist_sum, so their shows rank up on merit.
--   INSERT INTO public.user_preference_signals
--     (user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, context, occurred_at)
--   SELECT NEW.user_id, 'bucket_list', 'artist', v_artist_id, NEW.entity_name, v_weight,
--          jsonb_build_object('source', 'bucket_list', 'bucket_list_id', NEW.id), now()
--   WHERE NOT EXISTS (
--     SELECT 1 FROM public.user_preference_signals s
--     WHERE s.user_id = NEW.user_id
--       AND s.entity_type = 'artist'
--       AND s.entity_id = v_artist_id
--       AND s.context->>'source' = 'bucket_list'
--   );
--
--   -- That artist's genres: drives genre_sum, so SIMILAR artists surface too.
--   INSERT INTO public.user_preference_signals
--     (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
--   SELECT NEW.user_id, 'genre_manual_preference', 'genre', lower(btrim(g.genre)), v_weight,
--          jsonb_build_object('source', 'bucket_list', 'artist_id', v_artist_id), now()
--   FROM public.artists a
--   CROSS JOIN LATERAL unnest(a.genres) AS g(genre)
--   WHERE a.id = v_artist_id
--     AND a.genres IS NOT NULL
--     AND array_length(a.genres, 1) > 0
--     AND btrim(g.genre) <> ''
--     AND lower(btrim(g.genre)) <> 'small artist'
--     AND NOT EXISTS (
--       SELECT 1 FROM public.user_preference_signals s
--       WHERE s.user_id = NEW.user_id
--         AND s.genre = lower(btrim(g.genre))
--         AND s.context->>'artist_id' = v_artist_id::text
--     );
--
--   RETURN NEW;
-- EXCEPTION WHEN OTHERS THEN
--   -- Adding to the bucket list must never fail because signal derivation failed.
--   RAISE WARNING 'process_bucket_list_to_signals failed for %/%: %', NEW.user_id, NEW.id, SQLERRM;
--   RETURN NEW;
-- END;
-- $fn$;

-- REVOKE ALL ON FUNCTION public.process_bucket_list_to_signals() FROM PUBLIC;

-- DROP TRIGGER IF EXISTS trg_bucket_list_signals ON public.bucket_list;
-- CREATE TRIGGER trg_bucket_list_signals
--   AFTER INSERT ON public.bucket_list
--   FOR EACH ROW EXECUTE FUNCTION public.process_bucket_list_to_signals();

-- ===========================================================================
-- SECTION 2 - backfill existing bucket lists. Idempotent.
-- ===========================================================================

-- WITH resolved AS (
--   SELECT bl.id, bl.user_id, bl.entity_name, a.id AS artist_id, a.genres,
--          GREATEST(1.6 - 0.1 * COALESCE(bl.rank_order, 10), 0.6) AS weight
--   FROM public.bucket_list bl
--   JOIN public.entities en ON en.id = bl.entity_id AND en.entity_type = 'artist'
--   JOIN public.artists a ON a.id = en.entity_uuid
-- )
-- INSERT INTO public.user_preference_signals
--   (user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, context, occurred_at)
-- SELECT r.user_id, 'bucket_list', 'artist', r.artist_id, r.entity_name, r.weight,
--        jsonb_build_object('source', 'bucket_list', 'bucket_list_id', r.id), now()
-- FROM resolved r
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.user_preference_signals s
--   WHERE s.user_id = r.user_id AND s.entity_type = 'artist'
--     AND s.entity_id = r.artist_id AND s.context->>'source' = 'bucket_list'
-- );

-- WITH resolved AS (
--   SELECT bl.user_id, a.id AS artist_id, a.genres,
--          GREATEST(1.6 - 0.1 * COALESCE(bl.rank_order, 10), 0.6) AS weight
--   FROM public.bucket_list bl
--   JOIN public.entities en ON en.id = bl.entity_id AND en.entity_type = 'artist'
--   JOIN public.artists a ON a.id = en.entity_uuid
-- )
-- INSERT INTO public.user_preference_signals
--   (user_id, signal_type, entity_type, genre, signal_weight, context, occurred_at)
-- SELECT r.user_id, 'genre_manual_preference', 'genre', lower(btrim(g.genre)), r.weight,
--        jsonb_build_object('source', 'bucket_list', 'artist_id', r.artist_id), now()
-- FROM resolved r
-- CROSS JOIN LATERAL unnest(r.genres) AS g(genre)
-- WHERE r.genres IS NOT NULL AND array_length(r.genres, 1) > 0
--   AND btrim(g.genre) <> '' AND lower(btrim(g.genre)) <> 'small artist'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.user_preference_signals s
--     WHERE s.user_id = r.user_id AND s.genre = lower(btrim(g.genre))
--       AND s.context->>'artist_id' = r.artist_id::text
--   );

-- ===========================================================================
-- SECTION 3 - recompute + invalidate cache, same as 04. Without both, no visible change.
-- ===========================================================================

-- SELECT public.refresh_user_preferences_v5(DISTINCT bl.user_id) FROM public.bucket_list bl;
--   ^ if that syntax is rejected, use:
-- SELECT public.refresh_user_preferences_v5(u.user_id)
-- FROM public.users u
-- WHERE EXISTS (SELECT 1 FROM public.bucket_list bl WHERE bl.user_id = u.user_id);

-- DELETE FROM public.personalized_feed_cache c
-- WHERE EXISTS (SELECT 1 FROM public.bucket_list bl WHERE bl.user_id = c.user_id);

-- ===========================================================================
-- SECTION 4 - verify: bucket-list artists should now carry artist scores.
-- ===========================================================================

-- SELECT u.username,
--        (SELECT count(*) FROM jsonb_object_keys(p.artist_preference_scores::jsonb)) AS artist_keys,
--        (SELECT count(*) FROM jsonb_object_keys(p.genre_preference_scores::jsonb))  AS genre_keys,
--        (SELECT count(*) FROM public.bucket_list bl WHERE bl.user_id = u.user_id)   AS bucket_entries
-- FROM public.users u
-- JOIN public.user_preferences p ON p.user_id = u.user_id
-- WHERE EXISTS (SELECT 1 FROM public.bucket_list bl WHERE bl.user_id = u.user_id)
-- ORDER BY bucket_entries DESC;
