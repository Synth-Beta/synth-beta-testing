-- Create storage buckets for photos
-- This migration sets up storage buckets with appropriate policies for photo uploads

-- Create bucket for review photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-photos',
  'review-photos',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for profile avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for event photos (user-submitted)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-photos',
  'event-photos',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for review-photos bucket
-- Allow authenticated users to upload their own photos
CREATE POLICY "Users can upload review photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'review-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to review photos
CREATE POLICY "Public can view review photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'review-photos');

-- Allow users to update their own review photos
CREATE POLICY "Users can update their review photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'review-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own review photos
CREATE POLICY "Users can delete their review photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'review-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for profile-avatars bucket
-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to avatars
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-avatars');

-- Allow users to update their own avatar
CREATE POLICY "Users can update their avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete their avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for event-photos bucket
-- Allow authenticated users to upload event photos
CREATE POLICY "Users can upload event photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to event photos
CREATE POLICY "Public can view event photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-photos');

-- Allow users to update their event photos
CREATE POLICY "Users can update their event photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their event photos
CREATE POLICY "Users can delete their event photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

