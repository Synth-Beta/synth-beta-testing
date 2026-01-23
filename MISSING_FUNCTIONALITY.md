# Missing Functionality - Swift UI Components

## ⚠️ Critical: Review Before Replacing Components

Before replacing the web versions of bottom nav, headers, and side menu with Swift versions, the following functionality gaps must be addressed:

---

## 1. Side Menu - Missing Functionality

### ❌ User Data Fetching
**Web Version**: Fetches real user data from Supabase when menu opens
```typescript
const { data } = await supabase
  .from('users')
  .select('name, username, avatar_url')
  .eq('user_id', user.id)
```

**Swift Version**: Uses hardcoded placeholder data
```swift
userName: "User"
username: "synth"
initial: "S"
```

**Impact**: Users will see placeholder data instead of their actual profile information.

**Fix Required**: 
- Add Supabase Swift SDK integration
- Create user data fetching service
- Update `SideMenuView` to accept real user data

---

### ❌ User Profile Image Support
**Web Version**: Displays user avatar image from `avatar_url`
```typescript
imageUrl={userProfile?.avatar_url || undefined}
```

**Swift Version**: Only supports initial letter display
```swift
ProfilePictureView(size: .medium, variant: .initial, initial: initial)
```

**Impact**: User profile pictures will not be displayed.

**Fix Required**:
- Add image loading support to `ProfilePictureView`
- Implement image caching
- Handle image URL fetching

---

### ❌ Account Type Detection
**Web Version**: Uses `useAccountType` hook to detect account type
```typescript
const { accountInfo } = useAccountType();
accountType={accountInfo.account_type || 'user'}
```

**Swift Version**: Uses hardcoded account type
```swift
accountType: .user
```

**Impact**: Verification status card will not show correct account type-specific information.

**Fix Required**:
- Add account type detection service
- Fetch account type from Supabase
- Update verification display logic

---

### ❌ Real Verification Status Fetching
**Web Version**: Uses `VerificationStatusCard` component that fetches real data
```typescript
<VerificationStatusCard
  userId={user.id}
  accountType={accountInfo.account_type || 'user'}
  verified={accountInfo.verified || false}
/>
```

**Swift Version**: Uses hardcoded mock verification data
```swift
private var verificationData: VerificationStatusData {
    let criteria = [
        VerificationCriterion(..., met: false),
        // ... all hardcoded
    ]
}
```

**Impact**: Users will see fake verification status instead of their actual status.

**Fix Required**:
- Create verification status fetching service
- Implement criteria checking logic
- Update `SideMenuView` to use real data

---

### ❌ Profile Navigation with Tab Parameter
**Web Version**: Supports navigating to profile with specific tab
```typescript
onNavigateToProfile(undefined, 'timeline')
onNavigateToProfile(undefined, 'interested')
sessionStorage.setItem('profileTab', 'timeline')
```

**Swift Version**: Only switches to profile tab, no tab parameter
```swift
selectedTab = .profile
```

**Impact**: Users cannot navigate directly to "Event Timeline" or "Interested" tabs within profile.

**Fix Required**:
- Add tab parameter to navigation system
- Update profile view to accept initial tab
- Store tab state appropriately

---

### ❌ Session Storage Integration
**Web Version**: Uses `sessionStorage` to persist tab state
```typescript
sessionStorage.setItem('profileTab', 'timeline')
```

**Swift Version**: No session storage equivalent

**Impact**: Tab state is not persisted across app launches.

**Fix Required**:
- Use `UserDefaults` or similar for state persistence
- Implement tab state restoration

---

### ❌ Logout Implementation
**Web Version**: Actually signs out from Supabase
```typescript
await supabase.auth.signOut();
navigate('/');
```

**Swift Version**: Only calls callback (no implementation)
```swift
private func handleLogout() {
    menuOpen = false
}
```

**Impact**: Logout button does nothing.

**Fix Required**:
- Implement Supabase sign out
- Handle navigation after logout
- Clear user session data

---

## 2. Header - Missing Functionality

### ❌ Notification Bell Button
**Web Version**: Has notification bell button in `PermanentHeader.tsx`
```typescript
<NotificationBell
  onClick={onNavigateToNotifications}
  className="bg-[#cc2486] ... w-[44px] h-[44px]"
/>
```

**Swift Version**: Only has hamburger menu button, no notification button

**Impact**: Users cannot access notifications from header.

**Fix Required**:
- Add notification button to header variants
- Implement notification navigation
- Add notification badge/count display

---

## 3. Bottom Navigation - Missing Functionality

### ⚠️ Route Integration
**Web Version**: Uses React Router for navigation
```typescript
const navigate = useNavigate();
navigate('/mobile-preview/home');
```

**Swift Version**: Uses tab state management
```swift
selectedTab = .home
```

**Impact**: Navigation system is different. If you're keeping the web app, routes won't sync with tabs.

**Fix Required**:
- Create bridge between tab state and routes
- Or convert to full native navigation
- Ensure deep linking works

---

### ⚠️ Create/Post Button Behavior
**Web Version**: Navigates to `/mobile-preview/post` route
```typescript
path: '/mobile-preview/post'
```

**Swift Version**: Opens modal
```swift
activeModal = .eventReview
```

**Impact**: Different behavior - web navigates, Swift opens modal. Need to decide which approach to use.

**Fix Required**:
- Align behavior (either both navigate or both open modal)
- Ensure consistent user experience

---

## 4. General Integration Issues

### ❌ Supabase Integration
**Swift Version**: No Supabase SDK integration

**Impact**: Cannot fetch any real data from backend.

**Fix Required**:
- Add Supabase Swift SDK
- Configure Supabase client
- Create data fetching services

---

### ❌ Navigation Callbacks
**Web Version**: Uses callback functions for navigation
```typescript
onNavigateToNotifications?: () => void;
onNavigateToProfile?: (userId?: string, tab?: 'timeline' | 'interested') => void;
onNavigateToSettings?: () => void;
```

**Swift Version**: Uses NavigationStack and AppDestination enum
```swift
path.append(AppDestination.notifications)
```

**Impact**: Different navigation paradigms. Need to bridge them if keeping web app.

**Fix Required**:
- Create navigation coordinator
- Bridge callbacks to SwiftUI navigation
- Or convert entirely to SwiftUI navigation

---

## 📊 Summary

### Critical (Must Fix Before Replacement)
1. ✅ User data fetching in side menu
2. ✅ User profile image support
3. ✅ Real verification status fetching
4. ✅ Logout implementation
5. ✅ Notification button in header

### Important (Should Fix)
1. ⚠️ Account type detection
2. ⚠️ Profile navigation with tab parameter
3. ⚠️ Route/tab state synchronization

### Nice to Have
1. 💡 Session storage integration
2. 💡 Deep linking support

---

## 🎯 Recommended Fix Order

1. **First**: Implement Supabase integration (enables all data fetching)
2. **Second**: Fix side menu user data and logout
3. **Third**: Add notification button to header
4. **Fourth**: Implement verification status fetching
5. **Fifth**: Fix navigation and tab parameters

---

## ⚠️ Warning

**DO NOT replace the web components until at least the Critical items are fixed.** Users will experience broken functionality if you replace components with placeholder data.
