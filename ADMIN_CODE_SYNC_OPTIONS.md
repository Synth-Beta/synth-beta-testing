# Admin Page Code Sync Options

## ❌ Current Situation

**If `getsynth.app` is in a completely separate repository, changes made here will NOT automatically appear there.**

You'll need to manually sync the code or set up one of the solutions below.

---

## ✅ Solution Options

### Option 1: Manual Copy (Simplest for Now)
**Best for:** Quick setup, infrequent changes

1. Copy `src/pages/Admin.tsx` from this repo to getsynth.app repo
2. Copy any dependencies it needs
3. Update imports to match getsynth.app structure
4. Manually update both repos when you make changes

**Pros:** Simple, no infrastructure needed  
**Cons:** Manual sync required, risk of code drift

---

### Option 2: Shared Package/NPM Package (Recommended for Long-term)
**Best for:** Frequent updates, multiple repos using same code

Create a shared package that both repos can import:

```bash
# Create a new repo: @synth/admin-components
# Publish to npm or use as git submodule
```

**In both repos:**
```json
{
  "dependencies": {
    "@synth/admin-components": "git+https://github.com/your-org/admin-components.git"
  }
}
```

**Pros:** Single source of truth, easy updates  
**Cons:** Requires package setup, version management

---

### Option 3: Git Submodule
**Best for:** Shared code that changes together

```bash
# In getsynth.app repo:
git submodule add https://github.com/your-org/synth-beta-testing-main shared-code
```

**Pros:** Keeps repos linked, version controlled  
**Cons:** More complex git workflow, requires submodule updates

---

### Option 4: Monorepo (Best for Long-term)
**Best for:** Multiple related projects

Restructure to use a monorepo (Turborepo, Nx, etc.):

```
synth-monorepo/
├── apps/
│   ├── getsynth-app/      # getsynth.app
│   └── beta-testing/      # This repo
└── packages/
    └── admin/             # Shared admin code
```

**Pros:** Single repo, shared code, coordinated releases  
**Cons:** Major restructuring required

---

### Option 5: Copy Script (Quick Automation)
**Best for:** Frequent manual syncs

Create a script to copy Admin component:

```bash
#!/bin/bash
# sync-admin.sh

SOURCE="src/pages/Admin.tsx"
DEST="../getsynth-app/src/pages/Admin.tsx"

cp "$SOURCE" "$DEST"
echo "✅ Admin component synced to getsynth.app"
```

**Pros:** Quick sync, no infrastructure  
**Cons:** Still manual, one-way sync

---

## 🎯 Recommended Approach

**For immediate needs:** Use **Option 1** (Manual Copy)
- Copy the Admin component once
- Document that changes need to be synced manually
- Consider automation later if updates become frequent

**For long-term:** Plan for **Option 2** (Shared Package) or **Option 4** (Monorepo)
- If you'll be updating admin features frequently
- If you have other shared components
- If you want to maintain consistency

---

## 📝 What Needs to Be Synced

If using manual copy, these files need to stay in sync:

1. **`src/pages/Admin.tsx`** - Main admin component
2. **Dependencies it uses:**
   - `@/hooks/useAuth`
   - `@/hooks/useAccountType`
   - `@/pages/Auth`
   - `@/integrations/supabase/client`

**Note:** The hooks and services might already exist in both repos if they share the same auth system.

---

## 🔄 Workflow for Manual Sync

1. Make changes to `Admin.tsx` in this repo
2. Test changes here
3. Copy updated file to getsynth.app repo
4. Test in getsynth.app
5. Commit and deploy both repos

**Tip:** Add a comment at the top of Admin.tsx:
```tsx
// ⚠️ SYNC: This file is also used in getsynth.app repo
// Update both repos when making changes
```



