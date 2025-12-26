# Admin Page Shared Setup Instructions
## Edit in THIS repo, Display in getsynth.app repo

This setup allows you to edit the Admin component in **this codebase** and have it automatically work in the **getsynth.app** codebase.

---

## Setup Instructions for getsynth.app Repo

### Step 1: Install Admin Component as Git Dependency

In the `getsynth.app` repo, add this to `package.json`:

```json
{
  "dependencies": {
    "@synth/admin": "git+https://github.com/YOUR_USERNAME/synth-beta-testing-main.git#main:src/pages"
  }
}
```

**OR** if you want to import directly from the file:

```json
{
  "dependencies": {
    "@synth/admin": "git+https://github.com/YOUR_USERNAME/synth-beta-testing-main.git"
  }
}
```

Then run:
```bash
npm install
```

---

### Step 2: Create Admin Export File in THIS Repo

Create a new file in **THIS repo** to export the Admin component:

**File: `src/pages/admin-export.tsx`**
```tsx
// This file exports the Admin component for use in other repos
export { default } from './Admin';
export { default as Admin } from './Admin';
```

**OR** create a package entry point:

**File: `admin-package/index.ts`**
```tsx
export { default } from '../src/pages/Admin';
export { default as Admin } from '../src/pages/Admin';
```

---

### Step 3: Update getsynth.app to Import Admin

In the `getsynth.app` repo's `src/App.tsx` (or routing file):

```tsx
// Option A: If using git dependency
import Admin from '@synth/admin';

// Option B: If importing from relative path after copying
import Admin from './pages/Admin';

// In Routes:
<Route path="/admin" element={<Admin />} />
```

---

### Step 4: Ensure Dependencies Match

Make sure `getsynth.app` has all the dependencies that Admin needs:

**Required in getsynth.app:**
- `@/hooks/useAuth` (or equivalent)
- `@/hooks/useAccountType` (or equivalent)  
- `@/pages/Auth` (or equivalent)
- `@/integrations/supabase/client` (or equivalent)
- `lucide-react` (for icons)
- React Router

---

## Alternative: Simpler Direct Import (Recommended)

If git dependencies are too complex, use this approach:

### In THIS Repo (synth-beta-testing-main):

1. **Keep Admin component here:** `src/pages/Admin.tsx` ✅ (already done)

2. **Create export file:** `admin-export.tsx` in root or `src/pages/`

### In getsynth.app Repo:

1. **Add to package.json:**
```json
{
  "scripts": {
    "sync-admin": "curl -o src/pages/Admin.tsx https://raw.githubusercontent.com/YOUR_USERNAME/synth-beta-testing-main/main/src/pages/Admin.tsx"
  }
}
```

2. **Or manually copy** `src/pages/Admin.tsx` from this repo

3. **Add route:**
```tsx
import Admin from "./pages/Admin";
<Route path="/admin" element={<Admin />} />
```

---

## Best Solution: Git Submodule (For Active Development)

This allows you to edit in THIS repo and the other repo automatically gets updates.

### Setup in getsynth.app repo:

```bash
# In getsynth.app repo root:
git submodule add https://github.com/YOUR_USERNAME/synth-beta-testing-main.git shared-synth

# Create symlink or import:
ln -s shared-synth/src/pages/Admin.tsx src/pages/Admin.tsx
```

### In getsynth.app package.json:
```json
{
  "scripts": {
    "update-admin": "cd shared-synth && git pull && cd .."
  }
}
```

### When you update Admin in THIS repo:
```bash
# In getsynth.app repo:
npm run update-admin
```

---

## Recommended: Simple Copy Script (Easiest)

Create a script that syncs the Admin component automatically.

### In THIS repo, create `scripts/sync-admin-to-getsynth.sh`:

```bash
#!/bin/bash

# Configuration
GETSYNTH_REPO_PATH="../getsynth-app"  # Adjust path to getsynth.app repo
ADMIN_FILE="src/pages/Admin.tsx"

# Check if getsynth.app repo exists
if [ ! -d "$GETSYNTH_REPO_PATH" ]; then
  echo "❌ Error: getsynth.app repo not found at $GETSYNTH_REPO_PATH"
  echo "   Update the path in this script to point to your getsynth.app repo"
  exit 1
fi

# Copy Admin component
echo "📋 Copying Admin component to getsynth.app..."
cp "$ADMIN_FILE" "$GETSYNTH_REPO_PATH/$ADMIN_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Admin component synced successfully!"
  echo ""
  echo "Next steps in getsynth.app repo:"
  echo "  1. Review the changes: git diff $ADMIN_FILE"
  echo "  2. Commit: git add $ADMIN_FILE && git commit -m 'Update admin component'"
  echo "  3. Deploy"
else
  echo "❌ Error copying file"
  exit 1
fi
```

### Make it executable:
```bash
chmod +x scripts/sync-admin-to-getsynth.sh
```

### Add to package.json in THIS repo:
```json
{
  "scripts": {
    "sync-admin": "./scripts/sync-admin-to-getsynth.sh"
  }
}
```

### Usage:
```bash
# After editing Admin.tsx in THIS repo:
npm run sync-admin

# Then in getsynth.app repo, commit and deploy
```

---

## Complete Setup Checklist

### In THIS Repo (synth-beta-testing-main):
- [x] Admin component created at `src/pages/Admin.tsx`
- [ ] Create sync script (optional but recommended)
- [ ] Add sync script to package.json

### In getsynth.app Repo:
- [ ] Copy `src/pages/Admin.tsx` from this repo (or set up git dependency)
- [ ] Add route: `<Route path="/admin" element={<Admin />} />`
- [ ] Verify all dependencies exist (useAuth, useAccountType, Auth component, etc.)
- [ ] Test `/admin` route:
  - [ ] Shows login when not authenticated
  - [ ] Shows "Access Denied" for non-admin users
  - [ ] Shows admin dashboard for admin users

---

## Workflow: Editing Admin from THIS Repo

1. **Edit** `src/pages/Admin.tsx` in THIS repo
2. **Test** changes in THIS repo
3. **Sync** to getsynth.app:
   - Run `npm run sync-admin` (if using script)
   - OR manually copy the file
4. **In getsynth.app repo:**
   - Review changes
   - Commit: `git add src/pages/Admin.tsx && git commit -m "Update admin component"`
   - Deploy

---

## Notes

- The Admin component is self-contained and only needs the hooks/services
- If hooks/services have different paths in getsynth.app, you may need to update imports
- Consider using path aliases (`@/`) consistently in both repos
- The sync script approach is simplest and gives you control over when to update



