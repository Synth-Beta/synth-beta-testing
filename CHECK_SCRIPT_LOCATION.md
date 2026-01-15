# Quick Checklist: Why Xcode Cloud Can't Find ci_post_clone.sh

## ✅ What We Verified

- ✅ Script exists locally: `ci_scripts/ci_post_clone.sh`
- ✅ Script is committed to git
- ✅ Script is executable (100755)
- ✅ Script has correct shebang (`#!/bin/bash`)
- ✅ Script is at repository root

## 🔍 What to Check in App Store Connect

### 1. Check Which Branch Xcode Cloud Uses

**Location:** App Store Connect → Xcode Cloud → Your Workflow → "Start Conditions"

**What to check:**
- Which branch triggers builds?
- Is it `main` or a different branch?

**If different branch:**
```bash
# Check if script exists in that branch
git show origin/<branch-name>:ci_scripts/ci_post_clone.sh | head -3
```

### 2. Check Workflow Source

**Location:** App Store Connect → Xcode Cloud → Your Workflow → "Source"

**What to check:**
- Which repository/branch is configured?
- Is it pointing to the correct repository?

### 3. Check Recent Builds

**Location:** App Store Connect → Xcode Cloud → Recent Builds

**What to check:**
- When was the last build that included the script commit?
- The script was added in commit `054db20` - was that included?

### 4. Verify Script in Remote Repository

Run this command:
```bash
git fetch origin
git show origin/main:ci_scripts/ci_post_clone.sh | head -3
```

**Expected:** Should show the script content

**If fails:** The script isn't in the remote repository

## 🛠️ Quick Fixes to Try

### Fix 1: Force Push Script (if needed)
```bash
git add ci_scripts/ci_post_clone.sh
git commit --amend --no-edit  # If you want to update existing commit
# OR
git commit -m "Ensure ci_post_clone.sh is committed"
git push origin main --force-with-lease
```

### Fix 2: Verify Script Permissions in Git
```bash
# Make sure git tracks it as executable
git update-index --chmod=+x ci_scripts/ci_post_clone.sh
git commit -m "Ensure ci_post_clone.sh is executable in git"
git push origin main
```

### Fix 3: Check if Workflow Needs Update
- In App Store Connect, try editing and re-saving the workflow
- This sometimes refreshes the script detection

## 📋 Next Steps

1. **Check App Store Connect** → Which branch is the workflow using?
2. **Verify remote** → Run: `git show origin/main:ci_scripts/ci_post_clone.sh`
3. **Check build commit** → Does the build include commit `72ed37e` or later?
4. **Try re-saving workflow** → Sometimes Xcode Cloud needs a refresh
