# Copy-Paste Prompt for getsynth.app Repo

---

## Setup Admin Route at `/admin`

We need to add an admin dashboard route at `getsynth.app/admin` that:

1. **Shows a login screen** when users visit `/admin` without being authenticated (same Supabase auth system)
2. **Only allows access to users with `account_type = 'admin'`** in the `users` table
3. **Displays user information** in a dashboard format

### Required Changes:

**1. Add route to your React Router (`src/App.tsx` or main routing file):**

```tsx
import Admin from "./pages/Admin";

// In Routes:
<Route path="/admin" element={<Admin />} />
```

**2. Ensure `vercel.json` handles the route (should already work with catch-all):**

```json
{
  "rewrites": [
    { "source": "/auth/spotify/callback", "destination": "/" },
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

**3. Copy the Admin component** from the main repo (`src/pages/Admin.tsx`) or create it with:
   - Uses `useAuth()` hook to check authentication
   - Uses `useAccountType()` hook to check if user is admin
   - Shows `<Auth />` component when not logged in
   - Shows "Access Denied" when logged in but not admin
   - Displays user data table when admin is logged in

**4. Required dependencies:**
   - `@/hooks/useAuth` 
   - `@/hooks/useAccountType`
   - `@/pages/Auth`
   - `@/integrations/supabase/client`

The Admin component should query the `users` table and display user information in a table format with search, filtering, and pagination.

---

**Expected behavior:**
- `getsynth.app/admin` → Shows login if not authenticated
- After login as non-admin → Shows "Access Denied"  
- After login as admin → Shows admin dashboard with user data



