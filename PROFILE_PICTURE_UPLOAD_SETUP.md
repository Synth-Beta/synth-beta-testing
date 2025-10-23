# Profile Picture Upload Setup Guide

## Overview ✅
The profile picture upload functionality is already implemented and ready to use! Users can:
- Choose photos from their camera roll/files
- Take new photos with their camera
- Upload images up to 10MB
- Support formats: JPEG, PNG, WebP, HEIC
- Automatic upload to Supabase Storage
- Updates the `avatar_url` column in the profiles table

## Current Implementation

### Components
- **ProfilePictureUpload**: Main upload component with file selection, validation, and upload
- **ProfileEdit**: Uses ProfilePictureUpload for profile editing
- **ProfileView**: Displays the uploaded avatar

### Features Already Working
- ✅ File selection from camera roll/files
- ✅ Camera capture (mobile)
- ✅ File validation (type & size)
- ✅ Upload to Supabase Storage
- ✅ Update profiles table `avatar_url` column
- ✅ Preview before upload
- ✅ Remove existing photos
- ✅ Error handling with user feedback
- ✅ Loading states

## Required Setup Steps

### 1. Create Storage Bucket
Run this SQL in your Supabase SQL Editor:

```sql
-- See CREATE_AVATAR_STORAGE_BUCKET.sql for complete setup
```

Or run the file: `CREATE_AVATAR_STORAGE_BUCKET.sql`

### 2. Verify Storage Policies
The setup script creates these policies:
- **Public Read**: Anyone can view profile pictures
- **User Upload**: Users can upload to their own folder
- **User Update**: Users can update their own pictures
- **User Delete**: Users can delete their own pictures

### 3. Test the Upload
1. Go to Profile Edit page
2. Click "Add Photo" or "Change Photo"
3. Select from camera roll or take a new photo
4. Image should upload and appear immediately

## File Structure
```
src/components/profile/
├── ProfilePictureUpload.tsx  # Main upload component
├── ProfileEdit.tsx          # Uses ProfilePictureUpload
└── ProfileView.tsx          # Displays uploaded avatars
```

## Storage Structure
```
Supabase Storage Bucket: profile-avatars
├── {user_id}/
│   ├── timestamp1.jpg
│   ├── timestamp2.png
│   └── ...
```

## Database Schema
The `avatar_url` column in the profiles table stores the public URL:
```sql
avatar_url text null  -- Stores the full public URL to the uploaded image
```

## Supported Features
- **Mobile Camera**: `capture="environment"` prioritizes rear camera
- **File Types**: JPEG, JPG, PNG, WebP, HEIC
- **File Size**: Up to 10MB
- **Validation**: Client-side and server-side validation
- **Security**: RLS policies ensure users can only manage their own photos
- **Performance**: Images are cached with 1-hour cache control

## Usage in Components

### Basic Usage
```tsx
<ProfilePictureUpload
  currentAvatarUrl={profile?.avatar_url}
  userName={userName}
  onUploadSuccess={(newUrl) => setAvatarUrl(newUrl)}
  size="md"
/>
```

### Props
- `currentAvatarUrl`: Current profile picture URL
- `userName`: User's name for fallback initials
- `onUploadSuccess`: Callback when upload succeeds
- `size`: 'sm' | 'md' | 'lg' for avatar size
- `className`: Additional CSS classes

## Troubleshooting

### Common Issues
1. **Upload fails**: Check if storage bucket exists
2. **Permission denied**: Verify RLS policies are set
3. **File too large**: Images must be under 10MB
4. **Invalid format**: Only image files are accepted

### Debug Steps
1. Check browser console for errors
2. Verify Supabase Storage bucket exists
3. Check RLS policies in Supabase Dashboard
4. Ensure user is authenticated

## Ready to Use! 🎉
The profile picture upload is fully implemented and ready. Just run the storage bucket setup SQL and users can start uploading profile pictures immediately!
