-- =============================================================================
-- 06 — Storage follow-up: one regression I introduced, one bucket I missed
-- Follows file 02, which is already applied. Run after it.
-- =============================================================================
--
-- File 02 was written assuming the consumer buckets had NO whitelist, because no
-- migration in the repo creates them. The dashboard pre-state you captured shows
-- that was only partly true. Two corrections:

-- -----------------------------------------------------------------------------
-- ISSUE 1 (my regression) — review-videos already had a BROADER whitelist, and
--   file 02 narrowed it.
--
--     before: video/mp4, video/webm, video/quicktime,
--             video/x-msvideo, video/3gpp, video/x-flv
--     after:  video/mp4, video/quicktime, video/webm
--
--   video/3gpp is the one that matters: some Android cameras still record 3GP,
--   so those uploads now fail at the bucket. AVI and FLV are unlikely from a
--   phone but reachable from a desktop file picker.
--
--   The bucket IS in use — src/services/storageService.ts:3 declares it, and
--   src/components/reviews/ReviewFormSteps/QuickReviewStep.tsx:208 and
--   ReviewContentStep.tsx:105 upload to it.
--
--   Narrowing a whitelist is a legitimate hardening choice, but it should be a
--   decision you make, not a side effect of my assuming the column was NULL.
--   This restores the original set.
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'video/mp4', 'video/webm', 'video/quicktime',
      'video/x-msvideo', 'video/3gpp', 'video/x-flv'
    ]
WHERE id = 'review-videos';

-- If you would rather keep the narrow set, skip the statement above and instead
-- add back only 3gpp, which is the one with a real device behind it:
--   UPDATE storage.buckets
--   SET allowed_mime_types = ARRAY['video/mp4','video/quicktime','video/webm','video/3gpp']
--   WHERE id = 'review-videos';

-- NOTE — file 02 also changed two size limits. Both were deliberate, flagging so
--   they are on the record rather than discovered later:
--     profile-avatars  10 MiB -> 8 MiB   (tightened)
--     review-photos     5 MiB -> 8 MiB   (loosened, now matches the 8 MB the
--                                         chat UI already advertises)
--     event-photos      5 MiB -> 8 MiB   (loosened, same reason)
--   Revert any of them with a plain UPDATE if you prefer the old numbers.

-- -----------------------------------------------------------------------------
-- ISSUE 2 (bucket I did not know about) — "Concerts Upload"
--
--   From your pre-state dump:
--     id = 'Concerts Upload'   public = true
--     file_size_limit = NULL   allowed_mime_types = NULL
--     created 2025-09-03
--
--   Public, unlimited size, ANY mime type. That is the exact condition file 02
--   set out to fix, and it is the worst-configured bucket in the project — a
--   public bucket accepting text/html is a place to host content served from
--   your Supabase domain.
--
--   It has ZERO references in the codebase (grep across web, mobile, admin,
--   backend, api/ finds nothing). Created early, almost certainly leftover
--   scaffolding — note the display-name-style id with a space, unlike every
--   bucket the app actually uses.
-- -----------------------------------------------------------------------------

-- STEP 1 — check whether anything is actually stored in it before touching it.
SELECT count(*) AS object_count,
       min(created_at) AS oldest,
       max(created_at) AS newest,
       pg_size_pretty(COALESCE(sum((metadata ->> 'size')::bigint), 0)) AS total_size
FROM storage.objects
WHERE bucket_id = 'Concerts Upload';

-- STEP 2a — IF object_count = 0 (expected): delete the bucket outright.
--   Run only after confirming step 1 returned 0.
-- DELETE FROM storage.buckets WHERE id = 'Concerts Upload';

-- STEP 2b — IF it holds objects: do NOT delete. Lock it down instead, then
--   work out what put them there before deciding.
-- UPDATE storage.buckets
-- SET public = false,
--     file_size_limit = 8388608,
--     allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic']
-- WHERE id = 'Concerts Upload';

-- -----------------------------------------------------------------------------
-- VERIFY — full bucket state. Every row should have a non-NULL
--   allowed_mime_types and file_size_limit, and 'Concerts Upload' should be gone
--   (or private).
-- -----------------------------------------------------------------------------
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- Then re-test a video upload in the review flow, since Issue 1 touched it.
