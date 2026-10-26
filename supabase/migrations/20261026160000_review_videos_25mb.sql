-- Review videos: one clip per review, up to 30 seconds (enforced in the apps) and
-- 25MB (enforced here, so a modified client can't upload more). Was 100MB.
-- Constants: packages/synth-shared/src/reviewVideo.ts.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ROLLBACK: UPDATE storage.buckets SET file_size_limit = 104857600 WHERE id = 'review-videos';

UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE id = 'review-videos';
