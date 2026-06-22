-- Add 'image' as a valid message_type for chat image messages
-- Also creates the chat-images storage bucket for user-uploaded chat photos

-- 1. Update message_type CHECK constraint to include 'image'
ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('text', 'event_share', 'review_share', 'system', 'image'));

-- 2. Create chat-images storage bucket (public, 8MB limit, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'chat-images',
    'chat-images',
    true,
    8388608, -- 8MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies for chat-images bucket

-- Authenticated users can upload (folder = their user id)
CREATE POLICY "Users can upload chat images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'chat-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Public read access
CREATE POLICY "Public can view chat images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-images');

-- Users can delete their own chat images
CREATE POLICY "Users can delete their chat images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'chat-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
);
