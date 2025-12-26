# Setup Instructions for getsynth.app Repo

## Copy-Paste These Instructions to the getsynth.app Repo

---

## 🎯 Goal

Set up the `/admin` route at `getsynth.app/admin` that:
- Shows login screen when not authenticated
- Only allows admin users (`account_type = 'admin'`)
- Displays user information dashboard
- **Can be edited in the main repo and synced here**

---

## Step 1: Copy Admin Component

Copy the Admin component from the main repo:

**File to copy:** `src/pages/Admin.tsx` from `synth-beta-testing-main` repo

**Destination:** `src/pages/Admin.tsx` in this repo

---

## Step 2: Add Route to App

In `src/App.tsx` (or your main routing file), add:

```tsx
import Admin from "./pages/Admin";

// In your Routes component:
<Routes>
  <Route path="/" element={<AppPage />} />
  <Route path="/admin" element={<Admin />} />
  {/* ... other routes ... */}
</Routes>
```

---

## Step 3: Verify Dependencies

Ensure these exist in your repo (they should if you use the same auth system):

- ✅ `@/hooks/useAuth` (or equivalent auth hook)
- ✅ `@/hooks/useAccountType` (or equivalent)
- ✅ `@/pages/Auth` (or equivalent login component)
- ✅ `@/integrations/supabase/client` (or Supabase client)
- ✅ `lucide-react` (for icons)
- ✅ React Router

If any are missing or have different paths, update the imports in `Admin.tsx`.

---

## Step 4: Verify vercel.json (or routing config)

Your `vercel.json` should have a catch-all rewrite (should already work):

```json
{
  "rewrites": [
    { "source": "/auth/spotify/callback", "destination": "/" },
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

The catch-all `"/(.*)"` will handle `/admin` automatically.

---

## Step 5: Test

1. **Visit `getsynth.app/admin` while logged out**
   - Should show login screen ✅

2. **Login as non-admin user**
   - Should show "Access Denied" ✅

3. **Login as admin user** (`account_type = 'admin'`)
   - Should show admin dashboard with user data ✅

---

## Step 6: Set Up Sync (Optional but Recommended)

To automatically sync updates from the main repo, you can:

### Option A: Use the sync script from main repo

The main repo has a script: `npm run sync-admin`

**In the main repo**, update the path in `scripts/sync-admin-to-getsynth.sh` to point to this repo, then run:
```bash
npm run sync-admin
```

### Option B: Manual sync

When the Admin component is updated in the main repo:
1. Copy `src/pages/Admin.tsx` from main repo
2. Paste into this repo's `src/pages/Admin.tsx`
3. Review changes: `git diff src/pages/Admin.tsx`
4. Commit and deploy

---

## Troubleshooting

### Admin page shows main app instead of login
- Check that the route is added correctly in `App.tsx`
- Verify `vercel.json` has the catch-all rewrite
- Clear browser cache and try again

### "Access Denied" shows for admin users
- Verify user has `account_type = 'admin'` in `users` table
- Check that `useAccountType` hook is working correctly
- Verify Supabase RLS policies allow reading account_type

### Import errors
- Check that all dependencies exist
- Update import paths if your repo uses different aliases
- Ensure `@/` alias is configured in your build tool (Vite/Webpack)

### Users table not loading
- Verify Supabase connection
- Check RLS policies on `users` table
- Ensure admin user has proper permissions

---

## Notes

- The Admin component is self-contained
- All user data comes from the `users` table in Supabase
- The component handles authentication and authorization internally
- Updates to Admin can be synced from the main repo

---

## Quick Reference

**Route:** `/admin`  
**Component:** `src/pages/Admin.tsx`  
**Auth Required:** Yes  
**Admin Required:** Yes (`account_type = 'admin'`)  
**Database:** Queries `users` table



