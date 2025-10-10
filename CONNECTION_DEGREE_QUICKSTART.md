# Connection Degree Badge - Quick Start ⚡

## What You Get
A simple color-coded badge on user profiles showing connection degree:
- 🟢 **1st degree: Friends** → Dark Green
- 🟩 **2nd degree: Friends of Friends** → Light Green  
- 🟨 **3rd degree: Mutual Friends of Mutual Friends** → Yellow
- 🔴 **4th+ degree: Stranger** → Red

## Files
✅ **`SIMPLIFIED_LINKEDIN_CONNECTIONS.sql`** - Database functions (NO new tables!)
✅ **`src/components/ConnectionDegreeBadge.tsx`** - React component
✅ **`CONNECTION_DEGREE_INTEGRATION.md`** - Full integration guide

## Quick Setup

### 1️⃣ Run SQL (30 seconds)
```bash
psql -h your-host -d your-db -f SIMPLIFIED_LINKEDIN_CONNECTIONS.sql
```
This adds 5 functions, **no new tables**. Uses your existing `friends` table.

### 2️⃣ Add to Profile (2 minutes)
In `src/components/profile/ProfileView.tsx`:

**Import:**
```tsx
import { ConnectionDegreeBadge } from '../ConnectionDegreeBadge';
```

**Add badge (around line 1080):**
```tsx
<div className="flex items-center gap-4 mb-3">
  <h2 className="text-xl font-semibold">{profile.name}</h2>
  
  {/* ADD THIS */}
  {!isViewingOwnProfile && (
    <ConnectionDegreeBadge targetUserId={targetUserId} />
  )}
  
  {/* existing last_active badge below */}
```

### 3️⃣ Done! 🎉
View any user's profile to see their connection degree badge.

## What It Does
- Calculates connection degree in real-time
- Shows mutual friends count (for 2nd/3rd degree)
- Color-coded for quick recognition
- Hides on your own profile
- Uses existing friend system (no changes needed)

## Testing
```sql
-- Test in database
SELECT * FROM get_connection_info('your-user-id', 'other-user-id');
```

Then view profiles in the app to see the badges!

---

**Need more details?** See `CONNECTION_DEGREE_INTEGRATION.md` for full docs.
