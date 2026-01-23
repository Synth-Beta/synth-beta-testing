# Swift UI Merge Analysis

## Functionality Comparison

### Bottom Navigation

#### Web Version (`src/components/BottomNav/BottomNav.tsx`)
- **Navigation**: Uses React Router (`useNavigate`, `useLocation`)
- **Routes**: `/mobile-preview/home`, `/mobile-preview/discover`, `/mobile-preview/post`, `/mobile-preview/messages`, `/mobile-preview/profile`
- **Features**:
  - Active state detection based on current route
  - Icon switching (selected/unselected variants)
  - CTA button (Post) with special styling
  - Uses Lucide React icons for some items
- **Styling**: CSS with design tokens

#### Swift Version (`Synth-SwiftUI/Synth-SwiftUI/BottomNav.swift`)
- **Navigation**: Tab-based state management (`AppTab` enum)
- **Tabs**: `.home`, `.discover`, `.create`, `.chat`, `.profile`
- **Features**:
  - Active index tracking
  - Icon switching (selected/unselected variants)
  - CTA button (Create) with special styling
  - Custom icon system
- **Styling**: SwiftUI with design tokens

**Missing in Swift**: Direct route navigation (uses tab state instead)

---

### Header

#### Web Version (`src/components/Header/MobileHeader.tsx`)
- **Features**:
  - Centered content area (flexible children)
  - Hamburger/X menu button (swaps icon based on `menuOpen`)
  - 44x44 touch target
  - Fixed positioning with safe area support
- **Styling**: CSS with design tokens

#### Swift Version (`Synth-SwiftUI/Synth-SwiftUI/AppHeader.swift`)
- **Features**:
  - Multiple header variants:
    - `SynthHeaderContainer`: Base container with center/trailing content
    - `SynthHeaderTitle`: Simple title header
    - `SynthHeaderSearch`: Search bar header
    - `SynthHeaderLeadingControl`: Left-aligned control
    - `SynthHeaderTrailingMenuButton`: Hamburger/X menu button
    - `SynthHeaderDropdown`: Dropdown selector
  - Safe area handling
  - Flexible content areas
- **Styling**: SwiftUI with design tokens

**Missing in Swift**: Notification bell button (web version has this in `PermanentHeader.tsx`)

---

### Side Menu

#### Web Version (`src/components/SideMenu/SideMenu.tsx`)
- **Features**:
  - Real user data fetching from Supabase
  - User profile display (name, username, avatar)
  - Menu items:
    - Notifications (with navigation callback)
    - Event Timeline (navigates to profile with 'timeline' tab)
    - Interested (navigates to profile with 'interested' tab)
    - Settings (with navigation callback)
  - Verification status card (fetches from database)
  - Logout functionality (Supabase sign out)
  - Navigation callbacks:
    - `onNavigateToNotifications`
    - `onNavigateToProfile(userId?, tab?)`
    - `onNavigateToSettings`
    - `onSignOut`
  - Account type detection
  - Session storage for tab state

#### Swift Version (`Synth-SwiftUI/Synth-SwiftUI/SideMenuView.swift`)
- **Features**:
  - Placeholder user data (hardcoded "User", "synth", "S")
  - Menu items (configurable via `MenuCategoryItem` array)
  - Verification status display (hardcoded mock data)
  - Logout callback (no implementation)
  - Menu items in `AppShellView`:
    - Notifications (navigates to notifications destination)
    - Event Timeline (switches to profile tab)
    - Interested (switches to profile tab)
    - Settings (opens settings modal)

**Missing in Swift**:
1. Real user data fetching from Supabase
2. User profile image support (only initial letter)
3. Account type detection
4. Real verification status fetching
5. Tab parameter support for profile navigation
6. Session storage integration

---

## Integration Requirements

### Critical Missing Functionality

1. **Side Menu - User Data**:
   - Need to fetch user profile from Supabase
   - Need to display user avatar image
   - Need account type detection

2. **Side Menu - Navigation**:
   - Need to support tab parameter for profile navigation
   - Need to integrate with existing navigation system

3. **Side Menu - Verification**:
   - Need to fetch real verification status from database
   - Need to support different account types

4. **Header - Notification Button**:
   - Swift version doesn't have notification bell button
   - Web version has this in `PermanentHeader.tsx`

5. **Bottom Nav - Route Integration**:
   - Swift version uses tab state, web uses routes
   - Need to bridge these systems

---

## Merge Strategy

1. Copy all Swift UI components to `ios/App/App/`
2. Update Xcode project to include Swift files
3. Create integration layer to:
   - Fetch user data from Supabase
   - Connect navigation callbacks
   - Bridge tab state with routes
4. Add missing features (notification button, real data fetching)
5. Update AppDelegate to use SwiftUI root
