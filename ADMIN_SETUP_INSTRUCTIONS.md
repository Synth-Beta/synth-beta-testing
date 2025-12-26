# Admin Route Setup Instructions for getsynth.app

## Prompt to Give to the Other Repo

**"We need to set up an admin route at `/admin` for getsynth.app. This route should:**
1. **Use the same authentication system** (Supabase auth)
2. **Show a login screen** when not authenticated (not redirect to home)
3. **Only be accessible to users with `account_type = 'admin'`** in the `users` table
4. **Display user information** from the `users` table in a dashboard format

The admin page component is already created in the main repo. You need to:
- Add the `/admin` route to your React Router configuration
- Ensure your `vercel.json` (or routing config) handles the `/admin` route correctly
- Import and use the Admin component from the shared codebase (or copy it if it's separate repos)"

---

## Required Code Changes

### 1. Update `vercel.json` (if using Vercel)

The `vercel.json` should already have a catch-all rewrite, but make sure `/admin` is explicitly handled:

```json
{
  "rewrites": [
    { "source": "/auth/spotify/callback", "destination": "/" },
    { "source": "/admin", "destination": "/" },
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

**Note:** The catch-all `"/(.*)"` should already handle `/admin`, but adding it explicitly ensures it works.

### 2. Update `src/App.tsx` (or your main routing file)

Add the Admin route to your React Router:

```tsx
import Admin from "./pages/Admin";

// In your Routes component:
<Routes>
  <Route path="/" element={<AppPage />} />
  <Route path="/admin" element={<Admin />} />
  {/* ... other routes ... */}
</Routes>
```

### 3. Ensure Admin Component Exists

If the repos are separate, you'll need to copy the Admin component. The Admin component should:

- Import and use `useAuth()` hook
- Import and use `useAccountType()` hook  
- Show `<Auth />` component when not logged in
- Show "Access Denied" when logged in but not admin
- Display user data when admin is logged in

### 4. Required Dependencies

Make sure these are available in the getsynth.app repo:

- `@/hooks/useAuth` - Authentication hook
- `@/hooks/useAccountType` - Account type checking hook
- `@/pages/Auth` - Login component
- `@/integrations/supabase/client` - Supabase client
- `@/services/adminService` - Admin service (optional, can query directly)

---

## Quick Setup Checklist

- [ ] Add `/admin` route to React Router in `App.tsx`
- [ ] Verify `vercel.json` has proper rewrites (catch-all should work)
- [ ] Ensure Admin component exists (copy from main repo if needed)
- [ ] Verify all required hooks/services are available
- [ ] Test `/admin` route:
  - [ ] Shows login when not authenticated
  - [ ] Shows "Access Denied" when logged in as non-admin
  - [ ] Shows admin dashboard when logged in as admin

---

## Testing

1. Visit `getsynth.app/admin` while logged out → Should show login screen
2. Login as non-admin user → Should show "Access Denied"
3. Login as admin user → Should show admin dashboard with user data

---

## If Repos Are Completely Separate

If the getsynth.app repo doesn't share code with the main repo, you'll need to:

1. **Copy the Admin component** (`src/pages/Admin.tsx`) to the getsynth.app repo
2. **Ensure all dependencies exist** (hooks, services, components)
3. **Update imports** to match the getsynth.app repo structure
4. **Add the route** to the routing configuration

The Admin component is self-contained and only needs:
- Authentication hooks
- Supabase client
- Auth component for login
- Basic UI components (can use Tailwind classes directly if needed)



