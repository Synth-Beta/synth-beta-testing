# User Trust & Profile Visibility Implementation

## Overview
This document outlines the implementation of trust/verification features for user profiles, including profile picture requirements, public/private profiles, and last active tracking.

## Features Implemented

### 1. Profile Picture Requirement
- **Users without profile pictures are NOT visible to others**
- Users can still use the app, but other users won't see their profile
- Prominent banner on own profile when no profile picture is uploaded
- Banner includes a quick "Add Photo" button that takes user to edit profile

### 2. Public/Private Profile Toggle
- Added in Settings Modal
- Users can toggle between public and private profile
- **Public profiles:** Visible to all users (requires profile picture)
- **Private profiles:** Only visible to friends
- **Validation:** Users cannot make profile public without a profile picture
- Visual indicator shows when profile picture is required

### 3. Last Active Tracking
- Displays "Last active: X time ago" on user profiles when viewing others
- Formats: "Just now", "5m ago", "2h ago", "3d ago", "X days ago"
- Shown as a badge next to username when viewing profiles
- Updated automatically through activity tracking

### 4. Activity Tracking
- Automatic tracking via `useActivityTracker` hook in MainApp
- Updates on:
  - App launch
  - Every 5 minutes of activity
  - When user returns to tab (visibility change)
- Throttled to prevent excessive database writes (2 min minimum between updates)

## Database Changes

### New Fields Added to `profiles` Table:
```sql
- last_active_at: TIMESTAMP WITH TIME ZONE (default: now())
- is_public_profile: BOOLEAN (default: true)
```

### New Database Function:
```sql
update_user_last_active(user_id_param UUID)
```
- Updates the user's last_active_at timestamp
- Called by the app during user activity

### Updated RLS Policies:
The `profiles` table now has visibility-aware Row Level Security:
- Users can always see their own profile
- To be visible to others, users MUST have:
  1. A profile picture (`avatar_url` not null)
  2. Either:
     - Public profile (`is_public_profile = true`), OR
     - Be friends with the viewer

**This means filtering happens automatically at the database level!**

## Files Created/Modified

### New Files:
1. **`src/services/userVisibilityService.ts`**
   - Central service for visibility logic
   - Functions for checking user visibility
   - Formatting last active timestamps
   - Managing profile visibility settings

2. **`src/hooks/useActivityTracker.ts`**
   - Hook for tracking user activity
   - Automatic periodic updates
   - Visibility change detection

3. **`supabase/migrations/20250110000003_add_profile_visibility_fields.sql`**
   - Safe migration (uses IF NOT EXISTS)
   - Adds new fields
   - Creates indexes
   - Updates RLS policies
   - Creates update function

4. **`USER_TRUST_AND_VISIBILITY_IMPLEMENTATION.md`** (this file)
   - Implementation documentation

### Modified Files:

#### Components:
1. **`src/components/SettingsModal.tsx`**
   - Added public/private profile toggle
   - Profile picture validation before allowing public profile
   - Visual indicator when profile picture is required

2. **`src/components/ProfileView.tsx`** (own profile)
   - Banner when no profile picture
   - Prompts user to add photo

3. **`src/components/profile/ProfileView.tsx`** (viewing any profile)
   - Shows last active timestamp
   - Updated profile queries to include new fields

4. **`src/components/FriendProfileCard.tsx`**
   - Shows last active timestamp

5. **`src/components/MainApp.tsx`**
   - Integrated activity tracker hook

#### Types:
6. **`src/integrations/supabase/types.ts`**
   - Updated profiles Row/Insert/Update types

7. **`src/types/database.ts`**
   - Updated Profile interface

## How It Works

### Profile Visibility Flow:
```
1. User A tries to view User B's profile
2. Database RLS policy checks:
   - Is User A viewing their own profile? → YES: Allow
   - Are User A and User B friends? → YES: Allow (regardless of privacy settings)
   - Does User B have a profile picture AND public profile? → YES: Allow
   - Otherwise → Deny (profile not returned)
```

### Search Visibility Flow:
```
1. User A searches for users
2. Database RLS policy returns:
   - All friends (regardless of privacy settings)
   - All users with profile pictures (regardless of privacy settings)
3. Frontend filters based on context:
   - Search results: Shows all returned users
   - Event matching: Only shows public users with profile pics
   - Friend lists: Shows all friends
```

### Activity Tracking Flow:
```
1. User opens app → MainApp mounts → useActivityTracker hook activates
2. Hook immediately updates last_active_at
3. Every 5 minutes: Hook updates last_active_at (if 2+ min since last update)
4. User switches tabs away and back: Hook updates last_active_at
5. All updates are throttled to prevent excessive DB writes
```

### Public Profile Toggle Flow:
```
1. User opens Settings → Toggle visible
2. User tries to enable public profile
3. System checks: Does user have profile picture?
   - YES: Toggle succeeds, profile is now public
   - NO: Show error toast, toggle stays off
4. Visual indicator shows "Profile picture required"
```

## User Experience

### For Users Without Profile Pictures:
- See a prominent banner on their own profile
- Banner message: "Upload a profile picture to be visible to other users..."
- Quick "Add Photo" button for easy access
- Cannot toggle profile to public (validation prevents it)
- Can still use all other app features normally
- Are invisible in search results and user lists

### For Users Viewing Others:
- Only see users with profile pictures
- See "Last active: X ago" badge on profiles they view
- Friends can see each other even if private (but still need profile pic)
- Seamless experience - no error messages about hidden users

### Trust Indicators:
- Last active timestamp helps users gauge if others are active
- Profile picture requirement ensures real/engaged users
- Public/private setting gives users control

## Testing

To test the implementation:

1. **Profile Picture Requirement:**
   - Create a new account
   - Don't upload a profile picture
   - Try to search for this user from another account → Should not appear
   - Upload a profile picture
   - Search again → Should now appear

2. **Public/Private Toggle:**
   - Go to Settings
   - Try to enable public profile without photo → Should show error
   - Add a profile picture
   - Enable public profile → Should succeed
   - Disable (make private) → Only friends can now see you

3. **Last Active:**
   - View another user's profile
   - Should see "Last active: X ago" badge
   - Wait and refresh → Time should update

4. **Activity Tracking:**
   - Check database: `SELECT user_id, last_active_at FROM profiles;`
   - Use app for a while
   - Check again → last_active_at should be updated

## SQL Migration

**Run this SQL in your Supabase SQL Editor:**

```sql
-- Located in: supabase/migrations/20250110000003_add_profile_visibility_fields.sql
```

See the file for the complete migration script. It's safe to run multiple times.

## API/Service Methods

### UserVisibilityService:
- `isUserVisible(profile, currentUserId, isFriend)` - Check if user should be visible
- `filterVisibleUsers(profiles, currentUserId, friendIds)` - Filter array of profiles
- `formatLastActive(timestamp)` - Format last active time
- `updateLastActive(userId)` - Update user's last active timestamp
- `getUserVisibilitySettings(userId)` - Get visibility settings
- `setProfileVisibility(userId, isPublic)` - Update profile visibility
- `hasProfilePicture(userId)` - Check if user has profile picture
- `getFriendIds(currentUserId)` - Get list of friend IDs

### useActivityTracker Hook:
- Automatically tracks activity (no manual calls needed)
- Returns: `{ trackActivity }` - Can be called manually for specific actions

## Security

- All filtering is enforced at the database level via RLS policies
- Profile picture requirement is checked in RLS and at toggle
- No client-side only security (defense in depth)
- Profile visibility settings require authentication
- Last active updates require authentication

## Performance

- Indexes added on `last_active_at` and `is_public_profile`
- Activity updates throttled (min 2 minutes between updates)
- RLS policies use efficient EXISTS queries for friend checks
- Visibility filtering happens at query time (no post-processing needed)

## Future Enhancements (Not Implemented)

Potential future additions:
- Verification badges
- User reputation/trust scores
- "Online now" indicator (< 5 minutes)
- Activity status messages ("At a concert", etc.)
- Privacy zones (hide from specific users)
- Temporary profile visibility (vacation mode)

## Support

If users encounter issues:
1. Ensure they've run the migration SQL
2. Check profile has `last_active_at` and `is_public_profile` fields
3. Verify RLS policies are applied correctly
4. Check browser console for any errors

---

**Implementation completed:** January 10, 2025
**Database migration version:** 20250110000003

