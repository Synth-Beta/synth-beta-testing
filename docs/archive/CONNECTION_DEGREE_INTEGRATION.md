# Connection Degree Badge - Simple Integration Guide

## 🎯 **What This Does**
Adds a color-coded badge to user profiles showing their connection degree:
- **1st degree (Friends)** → Dark Green 🟢
- **2nd degree (Friends of Friends)** → Light Green 🟩  
- **3rd degree (Mutual Friends of Mutual Friends)** → Yellow 🟨
- **4th+ degree (Stranger)** → Red 🔴

## 📦 **Files Created**
1. **`SIMPLIFIED_LINKEDIN_CONNECTIONS.sql`** - Database functions (NO new tables!)
2. **`src/components/ConnectionDegreeBadge.tsx`** - React component

## 🚀 **Step 1: Run SQL**
```bash
# This only adds functions, no new tables!
psql -h your-host -d your-db -f SIMPLIFIED_LINKEDIN_CONNECTIONS.sql
```

**What it creates:**
- `get_connection_degree(user1_id, user2_id)` - Returns 0-4 (degree number)
- `get_connection_info(user1_id, user2_id)` - Returns degree, label, color, mutual count

**No new tables!** Uses your existing `friends` table.

## 🎨 **Step 2: Add to Profile View**

### **Import the component:**
```tsx
// At the top of src/components/profile/ProfileView.tsx
import { ConnectionDegreeBadge } from '../ConnectionDegreeBadge';
```

### **Add the badge to the profile header:**

Find this section (around line 1079-1086):
```tsx
<div className="flex items-center gap-4 mb-3">
  <h2 className="text-xl font-semibold">{profile.name}</h2>
  {!isViewingOwnProfile && profile.last_active_at && (
    <Badge variant="secondary" className="flex items-center gap-1 text-xs">
      <Clock className="w-3 h-3" />
      {UserVisibilityService.formatLastActive(profile.last_active_at)}
    </Badge>
  )}
```

**Add the connection badge right after the name:**
```tsx
<div className="flex items-center gap-4 mb-3">
  <h2 className="text-xl font-semibold">{profile.name}</h2>
  
  {/* ADD THIS: Connection Degree Badge */}
  {!isViewingOwnProfile && (
    <ConnectionDegreeBadge targetUserId={targetUserId} />
  )}
  
  {!isViewingOwnProfile && profile.last_active_at && (
    <Badge variant="secondary" className="flex items-center gap-1 text-xs">
      <Clock className="w-3 h-3" />
      {UserVisibilityService.formatLastActive(profile.last_active_at)}
    </Badge>
  )}
```

## ✅ **That's It!**

The badge will automatically:
- Show the connection degree with proper color
- Display mutual friends count (for 2nd/3rd degree)
- Hide on your own profile
- Update when friendship status changes

## 🎨 **Badge Styles**

### **Full Badge (Default)**
```tsx
<ConnectionDegreeBadge targetUserId={userId} />
```
Shows: `👥 Friends` or `🤝 Friends of Friends (3 mutual friends)`

### **Compact Badge (Optional)**
```tsx
<ConnectionDegreeCompactBadge targetUserId={userId} />
```
Shows: Small circular badge with `1st`, `2nd`, `3rd`, or `4th+`

## 🧪 **Testing**

### **Test the SQL functions:**
```sql
-- Check connection between two users
SELECT * FROM get_connection_info('user1-id', 'user2-id');

-- Should return something like:
-- degree | label                              | color       | mutual_friends_count
-- -------|-----------------------------------|-------------|---------------------
-- 2      | Friends of Friends                | light-green | 3
```

### **Test in the UI:**
1. View a friend's profile → Should show **dark green "Friends"** badge
2. View a friend-of-friend's profile → Should show **light green "Friends of Friends"** badge with mutual count
3. View a stranger's profile → Should show **red "Stranger"** badge
4. View your own profile → Should show **no badge**

## 🔧 **Customization**

### **Change Colors:**
Edit `getBadgeStyles()` in `ConnectionDegreeBadge.tsx`:
```tsx
const getBadgeStyles = (color: string) => {
  switch (color) {
    case 'dark-green':
      return 'bg-green-700 text-white hover:bg-green-800'  // Change these!
    case 'light-green':
      return 'bg-green-400 text-green-900 hover:bg-green-500'
    // ... etc
  }
}
```

### **Change Icons:**
Edit `getDegreeIcon()` in `ConnectionDegreeBadge.tsx`:
```tsx
const getDegreeIcon = (degree: number) => {
  switch (degree) {
    case 1: return '👥'  // Change these emojis!
    case 2: return '🤝'
    case 3: return '🔗'
    case 4: return '👤'
  }
}
```

### **Change Labels:**
Edit the SQL function `get_connection_info` in `SIMPLIFIED_LINKEDIN_CONNECTIONS.sql`:
```sql
CASE 
  WHEN conn_degree = 1 THEN 'Friends'              -- Change these!
  WHEN conn_degree = 2 THEN 'Friends of Friends'
  WHEN conn_degree = 3 THEN 'Mutual Friends of Mutual Friends'
  ELSE 'Stranger'
END
```

## 📊 **Performance**

- **Efficient SQL**: Uses CTEs and proper indexing
- **Cached on client**: Fetches once per profile view
- **No extra tables**: Uses existing `friends` table
- **Fast queries**: Optimized for up to 10K+ users

## 🔒 **Security**

- Uses existing RLS policies on `friends` table
- Functions granted to `authenticated` role only
- No sensitive data exposed
- Respects existing privacy settings

## 🎯 **Use Cases**

### **1. Profile Views**
Show connection degree when viewing any user's profile

### **2. Search Results**
Add compact badges to search result cards

### **3. Friend Lists**
Show degrees in friend-of-friend suggestions

### **4. Event Attendees**
Display connection degrees for other attendees

## 💡 **Pro Tips**

1. **Add to search results** for better context
2. **Use compact version** in lists/grids
3. **Show mutual friends** to encourage connections
4. **Cache the result** if viewing same profile multiple times
5. **Add tooltips** for more info on hover

---

**That's it!** You now have LinkedIn-style connection degrees without any complex infrastructure. Just run the SQL and add the component where you want it! 🎉
