-- Create storage bucket for profile avatars
-- This allows users to upload profile pictures that get stored in Supabase Storage

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars', 
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
) ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];

-- Create RLS policies for the bucket

-- Policy: Users can view all public avatar images
CREATE POLICY "Public avatar images are viewable by everyone" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-avatars');

-- Policy: Users can upload their own avatar images
CREATE POLICY "Users can upload their own avatar images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own avatar images
CREATE POLICY "Users can update their own avatar images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own avatar images
CREATE POLICY "Users can delete their own avatar images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Verify the bucket was created
SELECT id, name, public, file_size_limit, allowed_mime_types 
FROM storage.buckets 
WHERE id = 'profile-avatars';

-- Verify the policies were created
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%avatar%';
