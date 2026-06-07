-- Security hardening PHASE 2 — run ONLY after app builds ship:
--   - genreChatService + matchingService use chat RPCs (not direct chats INSERT)
--   - chat image UI uses signed URLs (chatImageStorage.ts web + mobile)
--
-- BREAKS old app if run early:
--   - Genre join / match chat creation (direct chats INSERT blocked)
--   - Chat image display (chat-images bucket made private)
--   - users.email in explicit SELECT lists (column revoke)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) chats — block direct client INSERT (RPC-only chat creation)
-- Requires: create_group_chat, create_direct_chat, get_or_create_verified_chat,
--           get_or_create_genre_chat (added in phase 1).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "chats_insert_policy" ON public.chats;

CREATE POLICY "chats_insert_policy"
  ON public.chats
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

REVOKE INSERT ON public.chats FROM anon, authenticated;
GRANT INSERT ON public.chats TO service_role;

-- ---------------------------------------------------------------------------
-- 2) users — hide email from client roles (service_role retains full access)
-- Requires: app reads email from auth session, not users.email column.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
  ) THEN
    REVOKE SELECT (email) ON public.users FROM anon, authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) chat-images storage — private bucket; participant-scoped read
-- Requires: signed URL helpers in app for display.
-- Path convention: {uploader_user_id}/{filename}
-- ---------------------------------------------------------------------------

UPDATE storage.buckets SET public = false WHERE id = 'chat-images';

DROP POLICY IF EXISTS "Public can view chat images" ON storage.objects;

CREATE POLICY "Chat participants can view chat images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1
        FROM public.messages m
        INNER JOIN public.chat_participants cp
          ON cp.chat_id = m.chat_id
         AND cp.user_id = auth.uid()
        WHERE m.message_type = 'image'
          AND (
            m.metadata->>'storage_path' = name
            OR m.metadata->>'image_url' LIKE '%/' || name
            OR m.metadata->>'image_url' LIKE '%/' || name || '%'
          )
      )
    )
  );

CREATE POLICY "Users can update their chat images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

COMMIT;
