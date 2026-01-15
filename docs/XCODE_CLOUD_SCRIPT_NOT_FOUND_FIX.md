# Fix: "Post-Clone script not found at ci_scripts/ci_post_clone.sh"

## The Problem

Xcode Cloud is looking for `ci_scripts/ci_post_clone.sh` but can't find it, even though the file exists in the repository.

## What to Check

### 1. Verify Script is Committed

Run this in your terminal:
```bash
git ls-files ci_scripts/ci_post_clone.sh
```

**Expected:** Should show `ci_scripts/ci_post_clone.sh`

**If empty:** The file isn't tracked by git. Add it:
```bash
git add ci_scripts/ci_post_clone.sh
git commit -m "Add ci_post_clone.sh script"
git push origin main
```

### 2. Verify Script Location

The script MUST be at the repository root:
```
repository-root/
  ├── ci_scripts/
  │   └── ci_post_clone.sh  ← Must be here
  ├── ios/
  ├── package.json
  └── ...
```

**Check:**
```bash
# From repository root
ls -la ci_scripts/ci_post_clone.sh
```

### 3. Verify Script is Executable

The script must be executable:
```bash
chmod +x ci_scripts/ci_post_clone.sh
git add ci_scripts/ci_post_clone.sh
git commit -m "Make ci_post_clone.sh executable"
git push origin main
```

### 4. Verify Script Name is Exact

The filename must be EXACTLY:
- `ci_post_clone.sh` (not `ci-post-clone.sh` or `ci_post_clone`)

### 5. Check Which Branch Xcode Cloud Uses

In App Store Connect:
1. Go to Xcode Cloud → Your Workflow
2. Check "Source" → Which branch is configured?
3. Make sure `ci_scripts/ci_post_clone.sh` exists in THAT branch

**Verify:**
```bash
# Check if script exists in the branch Xcode Cloud uses
git show origin/main:ci_scripts/ci_post_clone.sh | head -5
```

### 6. Verify Script Has Shebang

First line must be:
```bash
#!/bin/bash
```

**Check:**
```bash
head -1 ci_scripts/ci_post_clone.sh
```

Should show: `#!/bin/bash`

### 7. Check Workflow Configuration

In App Store Connect:
1. Go to Xcode Cloud → Your Workflow
2. Check "Start Conditions" → Which branch triggers builds?
3. Make sure that branch has the script committed

## Common Issues

### Issue: Script Not in Right Branch
**Solution:** Merge or cherry-pick the commit to the branch Xcode Cloud uses

### Issue: Script Not Executable in Git
**Solution:** 
```bash
git update-index --chmod=+x ci_scripts/ci_post_clone.sh
git commit -m "Make ci_post_clone.sh executable"
git push origin main
```

### Issue: Script in Wrong Location
**Solution:** Move to repository root:
```bash
# If script is elsewhere, move it
mv path/to/ci_post_clone.sh ci_scripts/ci_post_clone.sh
git add ci_scripts/ci_post_clone.sh
git commit -m "Move ci_post_clone.sh to correct location"
git push origin main
```

## Verification Checklist

Before the next build, verify:

- [ ] Script exists: `ls ci_scripts/ci_post_clone.sh`
- [ ] Script is tracked: `git ls-files ci_scripts/ci_post_clone.sh`
- [ ] Script is executable: `ls -l ci_scripts/ci_post_clone.sh` shows `-rwxr-xr-x`
- [ ] Script has shebang: `head -1 ci_scripts/ci_post_clone.sh` shows `#!/bin/bash`
- [ ] Script is in correct branch: `git show origin/main:ci_scripts/ci_post_clone.sh` works
- [ ] Script is at repository root (not in a subdirectory)

## After Fixing

1. Commit and push the fix
2. Trigger a new build in Xcode Cloud
3. Check logs for "🚀 Starting post-clone setup" (should appear now)
4. If still not found, check workflow configuration in App Store Connect
