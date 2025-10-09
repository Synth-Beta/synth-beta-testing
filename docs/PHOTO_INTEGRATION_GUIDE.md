# 📸 Photo Integration Guide

## Overview

This guide documents the complete photo integration system implemented across the PlusOne Event Crew app. The system enables users to upload photos for reviews and profile avatars with proper storage, security, and display.

## 🏗️ Architecture

### Backend (Supabase)

#### Storage Buckets
Three storage buckets are configured in Supabase:

1. **`review-photos`** - Event/concert review photos
   - Max size: 5MB per file
   - Max photos per review: 5
   - Public read access
   - User-scoped write/delete access

2. **`profile-avatars`** - User profile pictures
   - Max size: 2MB per file
   - Max photos: 1 per user
   - Public read access
   - User-scoped write/delete access

3. **`event-photos`** - User-submitted event photos (future)
   - Max size: 5MB per file
   - Public read access
   - User-scoped write/delete access

#### Database Schema
```sql
-- user_reviews table already has:
photos TEXT[], -- Array of photo URLs (1-5 recommended)
videos TEXT[], -- Array of video URLs (optional)

-- profiles table already has:
avatar_url TEXT -- Single avatar photo URL
```

#### Storage Policies
Row-Level Security (RLS) policies ensure:
- Users can only upload/modify/delete their own photos
- All photos are publicly readable
- Photos are stored in user-specific folders: `{user_id}/{filename}`

### Frontend Architecture

#### Core Services

**`storageService.ts`** - Centralized storage management
- Upload photos with compression
- Delete photos from storage
- Validate file types and sizes
- Auto-resize large images (max 1920px)
- Extract paths from URLs

#### Reusable Components

**`PhotoUpload`** - Multi-photo upload component
- Drag-and-drop grid interface
- Upload progress indicators
- Preview thumbnails
- Delete functionality
- Used in: Review forms

**`SinglePhotoUpload`** - Single photo upload component
- Avatar-style upload
- Circle or square aspect ratios
- Replace existing photo
- Used in: Profile editor

## 🚀 Implementation Points

### 1. Review Photo Upload

**Location:** `EventReviewForm.tsx` → `ReviewContentStep.tsx`

**User Flow:**
1. User creates/edits a review
2. After writing review text, they see photo upload section
3. Click "Add Photo" to select up to 5 photos
4. Photos are uploaded to `review-photos/{user_id}/`
5. URLs are saved to `user_reviews.photos` array

**Code Example:**
```tsx
<PhotoUpload
  value={formData.photos || []}
  onChange={(urls) => updateFormData({ photos: urls })}
  userId={user.id}
  bucket="review-photos"
  maxPhotos={5}
  maxSizeMB={5}
  label="Photos (Optional)"
  helperText="Add photos from the event"
/>
```

### 2. Review Photo Display

**Location:** `ReviewCard.tsx`, `ProfileReviewCard.tsx`

**Display Logic:**
- `ReviewCard` shows first photo as hero image
- `ProfileReviewCard` shows gallery grid (up to 6 photos, 2 videos)
- Photos lazy-load for performance

**Code Example:**
```tsx
{review.photos && review.photos.length > 0 && (
  <div className="mb-3 overflow-hidden rounded-lg border bg-gray-50">
    <img
      src={review.photos[0]}
      alt="Review"
      className="w-full h-56 object-cover"
      loading="lazy"
    />
  </div>
)}
```

### 3. Profile Avatar Upload

**Location:** `ProfileEdit.tsx`

**User Flow:**
1. User navigates to Edit Profile
2. Clicks on avatar or "Upload Photo" button
3. Selects photo (auto-compressed to 2MB max)
4. Photo uploads to `profile-avatars/{user_id}/`
5. URL saved to `profiles.avatar_url`
6. Old avatar auto-deleted when new one uploads

**Code Example:**
```tsx
<SinglePhotoUpload
  value={formData.avatar_url}
  onChange={(url) => handleInputChange('avatar_url', url || '')}
  userId={currentUserId}
  bucket="profile-avatars"
  maxSizeMB={2}
  aspectRatio="circle"
  label="Profile Picture"
/>
```

### 4. Avatar Display

**Location:** Throughout app (`ProfileView`, `ReviewCard`, comments, etc.)

**Display Logic:**
- Shows uploaded avatar if available
- Falls back to user's initials
- Cached for performance

## 📝 Usage Instructions

### For Developers

#### Adding Photo Upload to New Component

```tsx
import { PhotoUpload } from '@/components/ui/photo-upload';
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<string[]>([]);

  return (
    <PhotoUpload
      value={photos}
      onChange={setPhotos}
      userId={user.id}
      bucket="review-photos" // or "profile-avatars" or "event-photos"
      maxPhotos={5}
      maxSizeMB={5}
      label="Upload Photos"
    />
  );
}
```

#### Saving Photos to Database

```tsx
// For reviews
const reviewData = {
  rating: 5,
  review_text: "Great show!",
  photos: photos, // array of URLs
  is_public: true
};

await ReviewService.setEventReview(userId, eventId, reviewData);

// For profile
const profileData = {
  name: "John Doe",
  avatar_url: avatarUrl, // single URL
};

await supabase
  .from('profiles')
  .update(profileData)
  .eq('user_id', userId);
```

### For Users

#### Uploading Review Photos
1. Create a review for an event
2. Fill out rating and review text
3. Scroll to "Photos (Optional)" section
4. Click "Add Photo" button
5. Select up to 5 photos from your device
6. Wait for upload to complete (progress shown)
7. Remove photos by hovering and clicking X
8. Submit review

#### Uploading Profile Avatar
1. Go to Profile → Edit Profile
2. Click on avatar circle or "Upload Photo" button
3. Select a photo from your device
4. Photo automatically uploads and displays
5. Click "Save Changes" to persist

## 🔒 Security & Privacy

### Access Control
- **Upload**: Only authenticated users can upload
- **Read**: All photos are publicly readable
- **Modify/Delete**: Users can only modify/delete their own photos
- **Folder Isolation**: Photos stored in user-specific folders

### File Validation
- **Size limits**: 2MB (avatars), 5MB (reviews)
- **File types**: JPEG, JPG, PNG, WebP, HEIC only
- **Auto-compression**: Large images auto-resized to 1920px max
- **Quality**: 80% JPEG quality for optimal size/quality balance

### Storage Structure
```
buckets/
├── review-photos/
│   └── {user_id}/
│       ├── {timestamp}-{random}.jpg
│       └── {timestamp}-{random}.png
├── profile-avatars/
│   └── {user_id}/
│       └── {timestamp}-{random}.jpg
└── event-photos/
    └── {user_id}/
        └── {timestamp}-{random}.jpg
```

## 🧪 Testing

### Test Photo Upload
```bash
# 1. Create review with photos
- Navigate to an event
- Click "I Was There"
- Upload 3-5 photos
- Submit review
- Verify photos display in feed

# 2. Upload profile avatar
- Go to Profile → Edit
- Upload avatar photo
- Save
- Verify avatar shows in profile and comments

# 3. Delete photos
- Edit existing review
- Remove photos by clicking X
- Verify photos deleted from storage
```

### Verify Storage Buckets
```sql
-- Check if buckets exist
SELECT * FROM storage.buckets 
WHERE id IN ('review-photos', 'profile-avatars', 'event-photos');

-- Check uploaded files
SELECT * FROM storage.objects 
WHERE bucket_id = 'review-photos' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Verify Database
```sql
-- Check reviews with photos
SELECT id, user_id, photos, created_at 
FROM user_reviews 
WHERE photos IS NOT NULL 
  AND array_length(photos, 1) > 0
ORDER BY created_at DESC 
LIMIT 10;

-- Check profiles with avatars
SELECT user_id, name, avatar_url 
FROM profiles 
WHERE avatar_url IS NOT NULL
LIMIT 10;
```

## 🐛 Troubleshooting

### Photos Not Uploading
1. **Check authentication**: User must be logged in
2. **Check file size**: Must be under size limit
3. **Check file type**: Must be image/jpeg, png, webp, or heic
4. **Check browser console**: Look for error messages
5. **Check Supabase dashboard**: Verify bucket exists and has policies

### Photos Not Displaying
1. **Check URLs**: Verify URLs are stored in database
2. **Check public access**: Ensure bucket has public read policy
3. **Check CORS**: Supabase should auto-configure CORS
4. **Check network tab**: Verify images are loading

### Upload Fails with 400/403
1. **RLS policies**: Check storage policies are applied
2. **User authentication**: Ensure user token is valid
3. **Bucket permissions**: Verify bucket allows INSERT
4. **File path**: Ensure path starts with user_id

### Images Too Large
1. **Auto-compression enabled**: Service resizes to 1920px max
2. **Check compression quality**: Default is 80% (0.8)
3. **Manual compress**: Use online tools before upload
4. **Increase limits**: Modify bucket file_size_limit

## 📊 Performance Considerations

### Image Optimization
- Auto-resize to max 1920px
- JPEG compression at 80% quality
- WebP support for modern browsers
- Lazy loading in feeds

### Caching
- Browser cache: 1 hour (3600s)
- CDN edge caching by Supabase
- Avatar caching in components

### Best Practices
1. Upload photos in background
2. Show upload progress
3. Compress before upload
4. Use lazy loading
5. Implement pagination for photo galleries

## 🔄 Migration Checklist

✅ Storage buckets created
✅ Storage policies applied
✅ Database schema ready (photos/avatar_url fields exist)
✅ Storage service implemented
✅ Photo upload components created
✅ Review form integration complete
✅ Profile edit integration complete
✅ Display components updated
✅ Types updated in reviewService

## 🎯 Future Enhancements

### Planned Features
- [ ] Video upload support (infrastructure ready)
- [ ] Image editing (crop, rotate, filters)
- [ ] Bulk photo upload
- [ ] Photo albums/collections
- [ ] User-submitted event photos
- [ ] Photo tagging (people, locations)
- [ ] Advanced gallery views
- [ ] Photo search functionality

### Performance Improvements
- [ ] Progressive image loading
- [ ] Thumbnail generation
- [ ] WebP conversion server-side
- [ ] CDN optimization
- [ ] Image lazy loading library

## 📚 Related Documentation

- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)
- [Image Optimization Guide](../docs/image-optimization.md)
- [Review System Guide](./REVIEW_SYSTEM_INTEGRATION.md)

## 🆘 Support

For issues or questions:
1. Check console logs for errors
2. Verify Supabase dashboard for storage issues
3. Check network tab for failed requests
4. Review RLS policies in Supabase
5. Contact dev team with reproduction steps

---

**Last Updated:** 2025-02-01
**Status:** ✅ Production Ready
**Tested:** ✅ Yes

