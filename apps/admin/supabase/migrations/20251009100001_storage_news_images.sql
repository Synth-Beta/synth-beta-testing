-- Storage bucket for In the News / Media section images (admin uploads, public read)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'news-images',
  'news-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Public read so /pr Media page can display images
CREATE POLICY "Public can view news images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'news-images');

-- Only admins can upload
CREATE POLICY "Admins can upload news images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'news-images'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_id = auth.uid()
    AND users.account_type = 'admin'
  )
);

-- Only admins can update
CREATE POLICY "Admins can update news images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'news-images'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_id = auth.uid()
    AND users.account_type = 'admin'
  )
);

-- Only admins can delete
CREATE POLICY "Admins can delete news images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'news-images'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_id = auth.uid()
    AND users.account_type = 'admin'
  )
);
