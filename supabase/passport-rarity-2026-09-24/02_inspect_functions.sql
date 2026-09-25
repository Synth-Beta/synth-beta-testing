-- Passport stamps — read the existing machinery before touching it.
-- READ-ONLY. 2026-09-24.
--
-- Context: auto_unlock_passport_on_review() exists but is attached to NO
-- trigger (diagnostic 4 returned no rows). Stamps stop at 2026-01-18.
-- Re-attaching it blindly is not safe until we read what it assumes.

-- A. The detached trigger function. THE key question: does it key off
--    NEW.event_id? `reviews.event_id` is always NULL in this database, so a
--    body written against event_id would still do nothing once re-attached.
--    It needs to use NEW.artist_id / NEW.venue_id (+ user_created_* ).
SELECT pg_get_functiondef(p.oid) AS auto_unlock_passport_on_review
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'auto_unlock_passport_on_review';

-- B. The unlock_* helpers it calls. Note unlock_passport_venue has TWO
--    overloads (p_venue_id uuid AND p_venue_id text) while
--    unlock_passport_artist has only the text one — an ambiguity/mismatch
--    worth seeing before we depend on either.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS body
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('unlock_passport_artist', 'unlock_passport_venue',
                    'unlock_passport_city', 'unlock_passport_scene')
ORDER BY p.proname, args;

-- C. The backfill path. If this is sound we can replay 8 months of missed
--    stamps instead of writing a migration by hand.
SELECT pg_get_functiondef(p.oid) AS recalculate_all_passport_data
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'recalculate_all_passport_data';

-- D. Confirm the trigger really is absent (not just filtered out by my
--    earlier WHERE clause). Expect zero rows on reviews.
SELECT c.relname AS table_name, t.tgname, p.proname AS function,
       t.tgenabled AS enabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal AND c.relname = 'reviews'
ORDER BY t.tgname;

-- E. How much would a backfill actually create? Published reviews that have
--    an artist or venue but no matching stamp yet.
SELECT
  count(*)                                         AS published_reviews,
  count(DISTINCT user_id)                          AS users,
  count(DISTINCT artist_id) FILTER (WHERE artist_id IS NOT NULL) AS artists,
  count(DISTINCT venue_id)  FILTER (WHERE venue_id  IS NOT NULL) AS venues,
  count(*) FILTER (WHERE artist_id IS NULL AND venue_id IS NULL) AS unusable
FROM public.reviews
WHERE is_draft = false;

-- F. Why are there only 3 users with stamps when 30 have achievements?
--    Did the old writer only ever fire for a few people?
SELECT count(DISTINCT user_id) AS users_with_stamps FROM public.passport_entries;
SELECT count(DISTINCT user_id) AS users_with_published_reviews
FROM public.reviews WHERE is_draft = false;
