-- Create storage bucket for review videos
-- This migration sets up storage bucket with appropriate policies for video uploads

-- Create bucket for review videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-videos',
  'review-videos',
  true,
  104857600, -- 100MB limit for videos
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/3gpp', 'video/x-flv']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for review-videos bucket
-- Allow authenticated users to upload their own videos
CREATE POLICY "Users can upload review videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'review-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to review videos
CREATE POLICY "Public can view review videos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'review-videos');

-- Allow users to update their own review videos
CREATE POLICY "Users can update their review videos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'review-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own review videos
CREATE POLICY "Users can delete their review videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'review-videos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

