-- =============================================================================
-- 02 — Storage: enforce upload type/size at the bucket, finish chat-images privacy
-- Finding #6, security review 2026-09-01
-- =============================================================================
--
-- PROBLEM A — no server-side upload whitelist on the consumer buckets.
--   The admin buckets set it properly (apps/admin/supabase/migrations/
--   20250201000000_create_storage_buckets.sql passes file_size_limit +
--   allowed_mime_types). The consumer buckets — review-photos, profile-avatars,
--   event-photos, review-videos, chat-images — have no creating migration in the
--   repo; they were made in the dashboard and their whitelist is unset.
--
--   What exists today is client-side only, which is not a control:
--     src/services/storageService.ts:18        allowedTypes — enforced in browser
--     src/components/UnifiedChatView.tsx:1103  size check only, then forwards
--                                              contentType: file.type verbatim
--     mobile/src/utils/chatImageStorage.ts:61  same shape, caller-supplied contentType
--   Anyone can skip the UI and call the Storage API directly with the anon key,
--   storing e.g. text/html and having it served back with that content type.
--
-- PROBLEM B — chat-images is still a PUBLIC bucket.
--   supabase/security-review-2026-07-10/02_chat_images_bucket_privacy.sql applied
--   only the listing-policy half; the privacy flip was left commented at line 67
--   because, at the time, the app displayed images via getPublicUrl().
--   THAT IS NO LONGER TRUE. Both clients now resolve signed URLs at render time:
--     src/utils/chatImageStorage.ts:56        createSignedUrl
--     src/components/UnifiedChatView.tsx:114  "resolve signed URLs at render time"
--     mobile/src/utils/chatImageStorage.ts:2  "bucket is private — signed URLs required"
--     mobile/app/chat/[id].tsx:59             same
--   A repo-wide grep finds ZERO getPublicUrl calls against chat-images. The code
--   migration is done; only the DB flip is outstanding. While the bucket stays
--   public, every private-conversation image is fetchable by URL with no auth at
--   all and the signed URLs are decoration.
--
-- Run each numbered block separately.

-- -----------------------------------------------------------------------------
-- DRY RUN — current bucket state. Note which are public and which have a NULL
--   allowed_mime_types (NULL = anything goes).
-- -----------------------------------------------------------------------------
SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
FROM storage.buckets
ORDER BY id;

-- Sample a real chat-images path so the folder assumption below is verified,
-- not guessed (uploader-uid folder vs chat-id folder):
SELECT name FROM storage.objects WHERE bucket_id = 'chat-images' LIMIT 5;

-- -----------------------------------------------------------------------------
-- APPLY A — image buckets: whitelist types, cap size.
--   8 MiB matches the client cap already shown to users in
--   src/components/UnifiedChatView.tsx (MAX_MB = 8); 5 MiB matches the
--   storageService default. Using 8 MiB everywhere keeps one number.
--   image/heic is included because iOS uploads it natively.
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
    ],
    file_size_limit = 8388608          -- 8 MiB
WHERE id IN ('review-photos', 'profile-avatars', 'event-photos', 'chat-images');

-- -----------------------------------------------------------------------------
-- APPLY B — video bucket, separate types and a larger cap.
--   Skip this statement if review-videos is unused.
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm'],
    file_size_limit = 104857600        -- 100 MiB
WHERE id = 'review-videos';

-- -----------------------------------------------------------------------------
-- APPLY C — finish the chat-images privacy migration (Problem B).
--   Safe now: no code path calls getPublicUrl on this bucket.
--   Do this ONE bucket at a time and smoke test before moving on.
-- -----------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'chat-images';

-- -----------------------------------------------------------------------------
-- VERIFY
-- -----------------------------------------------------------------------------
-- 1) Re-run the DRY RUN — allowed_mime_types populated, chat-images public = false.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('review-photos','profile-avatars','event-photos','review-videos','chat-images');

-- 2) In the app, on BOTH web and mobile:
--      - open an existing chat containing an image  -> still displays (signed URL)
--      - send a new image in chat                   -> uploads and displays
--      - upload a review photo and a profile avatar -> both still work
-- 3) Negative test — this should now be rejected by the bucket, not just the UI:
--      curl -X POST "$SUPABASE_URL/storage/v1/object/chat-images/<uid>/x.html" \
--        -H "Authorization: Bearer <a real user JWT>" \
--        -H "Content-Type: text/html" --data '<script>alert(1)</script>'
--    Expect 400 invalid_mime_type. Before this migration it returns 200.

-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- UPDATE storage.buckets SET public = true WHERE id = 'chat-images';
-- UPDATE storage.buckets SET allowed_mime_types = NULL, file_size_limit = NULL
--  WHERE id IN ('review-photos','profile-avatars','event-photos','review-videos','chat-images');
