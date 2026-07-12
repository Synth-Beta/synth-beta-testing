-- =============================================================================
-- 02 — Stop enumeration of the chat-images bucket
-- Advisor: public_bucket_allows_listing (bucket 'chat-images')
-- =============================================================================
--
-- CURRENT STATE (verified 2026-07-10) — policies on storage.objects for this bucket:
--   "Public can view chat images"       SELECT  role public         USING (bucket_id = 'chat-images')
--   "Users can upload chat images"      INSERT  role authenticated  (owner folder = auth.uid())
--   "Users can delete their chat images" DELETE role authenticated  (owner folder = auth.uid())
--
-- THE PROBLEM:
--   The broad public SELECT policy lets anyone with the anon key call the Storage
--   list API and enumerate every file path in a private-conversation bucket.
--
-- WHY THE PRIMARY FIX IS NON-BREAKING:
--   'chat-images' is a PUBLIC bucket. Public buckets serve files at
--   /storage/v1/object/public/chat-images/... WITHOUT RLS. The app displays chat
--   images via getPublicUrl(), which uses that public path. Removing the broad
--   SELECT (list) policy stops enumeration but does NOT stop those public URLs
--   from loading. So existing image display keeps working.
--
-- -----------------------------------------------------------------------------
-- DRY RUN — confirm the policies before changing
-- -----------------------------------------------------------------------------
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (qual ILIKE '%chat-images%' OR with_check ILIKE '%chat-images%');

-- -----------------------------------------------------------------------------
-- PRIMARY FIX (non-breaking): replace the broad public listing policy with an
--   owner+participant-scoped SELECT. Enumeration via the API now requires that
--   you own the file's folder or belong to the chat; public-URL display is
--   unaffected because the bucket is still public.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view chat images" ON storage.objects;

CREATE POLICY "Chat participants can view chat images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (
      -- the uploader (folder is named after their uid)
      (auth.uid())::text = (storage.foldername(name))[1]
      -- or a participant of the chat this image belongs to, when the path is
      -- structured as <chat_id>/... (adjust if your paths differ)
      OR EXISTS (
        SELECT 1 FROM public.chat_participants cp
        WHERE cp.user_id = auth.uid()
          AND cp.chat_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- NOTE: If chat-images paths are structured as <uid>/... (uploader folder) and
--   NOT <chat_id>/..., the EXISTS branch simply never matches and the uploader
--   branch governs — still non-breaking. Review one real object path first:
--     SELECT name FROM storage.objects WHERE bucket_id = 'chat-images' LIMIT 5;

-- -----------------------------------------------------------------------------
-- OPTIONAL STRONGER FIX (NOT non-breaking — requires app changes, do NOT run
--   until the frontend switches image display from getPublicUrl() to
--   createSignedUrl()). Left commented on purpose.
-- -----------------------------------------------------------------------------
-- UPDATE storage.buckets SET public = false WHERE id = 'chat-images';

-- -----------------------------------------------------------------------------
-- VERIFY after applying the primary fix
-- -----------------------------------------------------------------------------
-- 1) Open a chat that contains an image  -> image still displays
-- 2) Upload a new image in chat          -> still works (INSERT policy unchanged)

-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "Chat participants can view chat images" ON storage.objects;
-- CREATE POLICY "Public can view chat images" ON storage.objects
--   FOR SELECT TO public USING (bucket_id = 'chat-images');
