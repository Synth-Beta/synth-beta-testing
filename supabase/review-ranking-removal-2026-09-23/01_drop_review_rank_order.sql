-- Review ranking removal — 2026-09-23. REVIEW ONLY, NOT APPLIED.
--
-- The "rank your reviews" feature is gone from all three clients (web, mobile
-- Expo, admin). No code reads or writes reviews.rank_order any more.
--
-- It ordered reviews WITHIN a star tier: your 5★ reviews as #1, #2, #3, then
-- your 4.5★ group restarting at #1 (admin's setRankOrderForRatingGroup wrote
-- dense 1..N per rating group).
--
-- ⚠️  bucket_list.rank_order is a DIFFERENT, LIVE feature (the ranked bucket
--     list that feeds personalization). Nothing below touches it. Do not
--     "tidy up" by dropping rank_order everywhere it appears.
--
-- Diagnostics, run 2026-09-23:
--   rank_order base tables : bucket_list (KEEP), reviews (dropped below)
--   reviews_with_a_rank    : 41
--   dependent objects      : none — nothing references the column
--
-- No backup. The 41 ranks order a feature that no longer exists, so they are
-- not worth a table. This is one-way: once dropped, that ordering is gone.

-- Optional: look at what goes away first.
-- SELECT id, user_id, rating, rank_order FROM public.reviews
-- WHERE rank_order IS NOT NULL ORDER BY rating DESC, rank_order;

ALTER TABLE public.reviews DROP COLUMN IF EXISTS rank_order;

-- ── Loose end, unrelated to the drop ─────────────────────────────────────
-- apps/admin/src/services/reviewService.ts queries `user_reviews` 21 times,
-- but the diagnostic listed no such BASE TABLE. So it is either a view, or it
-- does not exist and the admin review service has been failing every call.
-- Worth knowing either way; it does not block the drop.
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_reviews';
