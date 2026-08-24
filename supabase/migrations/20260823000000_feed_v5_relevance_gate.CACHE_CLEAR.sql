-- Run LAST, after the VERIFY query. This one DOES write.
--
-- WHY THIS IS NEEDED
-- ------------------
-- Feeds are served through get_or_refresh_feed_v5_cached, and its cache_key is
-- md5 of the request params only (user, lat, lng, radius, ...). The ranking
-- model is NOT part of the key, so replacing get_personalized_feed_v5 does not
-- invalidate anything. Every existing personalized_feed_cache row still holds
-- a payload ranked by the OLD zero-match-heavy formula, and will keep being
-- served until its TTL expires. Without this step the fix looks like it did
-- nothing.
--
-- SAFE TO RUN: personalized_feed_cache is a derived cache, fully rebuildable
-- from get_personalized_feed_v5. No source data lives here. Worst case is that
-- the next request per user takes the cold path instead of the cached one.

BEGIN;

-- Drop every cached ranking. Next request per user rebuilds from the new
-- function.
DELETE FROM public.personalized_feed_cache;

-- Drop pending refresh jobs too -- they carry params for cache_keys that no
-- longer exist, and process_feed_cache_refresh_queue would just rebuild rows
-- nobody asked for.
DELETE FROM public.feed_cache_refresh_queue;

COMMIT;

-- OPTIONAL, only if cold-path latency on first load is a concern. Note from
-- prior work: process_feed_cache_refresh_queue(200) was timing out at 80-93s,
-- so use a small batch and run it a few times rather than one big call.
--
--   SELECT public.prewarm_feed_caches();
--   SELECT public.process_feed_cache_refresh_queue(25);
