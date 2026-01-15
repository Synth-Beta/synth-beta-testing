# Real Fix for Xcode Cloud Dependency Resolution

## The Actual Problem

The error "Could not resolve package dependencies: the package at '/Volumes/workspace/repository/node_modules/@capacitor/app' cannot be accessed" happens because:

1. **Swift Package Manager resolves dependencies BEFORE `ci_post_clone.sh` completes**
   - SPM runs its resolution phase during project loading
   - This happens before or during `ci_post_clone.sh` execution
   - `node_modules` doesn't exist yet when SPM tries to resolve

2. **Timing Issue**
   - Even though `ci_post_clone.sh` installs npm packages
   - SPM might resolve dependencies in parallel or before the script finishes
   - This causes a race condition

## The Real Solution

You need **BOTH** approaches:

### 1. Add a Pre-Build Script in Xcode (REQUIRED)

In Xcode, add a "Run Script" build phase that runs BEFORE package resolution:

1. Open `ios/App/App.xcodeproj` in Xcode
2. Select the project in navigator
3. Select the "App" target
4. Go to "Build Phases" tab
5. Click "+" → "New Run Script Phase"
6. Drag it to be the FIRST build phase (before "Compile Sources")
7. Name it: "Install Dependencies Before Package Resolution"
8. Add this script:

```bash
#!/bin/bash
set -e

# Only run if node_modules doesn't exist
if [ ! -d "${SRCROOT}/../../../node_modules" ]; then
  echo "📦 Installing npm dependencies for SPM resolution..."
  cd "${SRCROOT}/../../.."
  
  # Check if package.json exists
  if [ -f "package.json" ]; then
    if [ -f "package-lock.json" ]; then
      npm ci --prefer-offline --no-audit
    else
      npm install --no-audit
    fi
    
    # Verify Capacitor packages exist
    if [ ! -d "node_modules/@capacitor/app" ]; then
      echo "❌ Error: Capacitor packages not installed"
      exit 1
    fi
  fi
fi
```

9. **Important:** Set "Shell" to `/bin/bash`
10. **Important:** Uncheck "Show environment variables in build log" (optional)
11. **Important:** Check "For install builds only" = NO
12. **Important:** Check "Based on dependency analysis" = NO

### 2. Keep `ci_post_clone.sh` (Backup)

Keep the `ci_post_clone.sh` script as a backup, but the build phase script will handle it first.

## Alternative: Disable Automatic Package Resolution

If the above doesn't work, you can disable automatic package resolution:

1. In Xcode, go to File → Packages → Resolve Package Versions
2. This creates a `Package.resolved` file
3. Commit this file to git
4. In Xcode Cloud workflow settings, disable "Automatic Package Resolution"
5. This forces Xcode to use the committed resolved versions

However, this might not help if the paths still don't resolve.

## Why This Works

- Build Phase scripts run **during the build**, before SPM tries to resolve local package paths
- This ensures `node_modules` exists when SPM needs it
- Build phases execute synchronously, so there's no race condition

## Verification

After adding the build phase:

1. **Test locally:**
   ```bash
   # Clean everything
   rm -rf node_modules
   rm -rf ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
   
   # Open in Xcode
   open ios/App/App.xcodeproj
   
   # Try to build - the script should run first
   ```

2. **Check Xcode Cloud logs:**
   - Look for "📦 Installing npm dependencies for SPM resolution..."
   - This should appear BEFORE package resolution errors

## If It Still Fails

If it still fails, check:

1. **Build Phase Order:** Is the script phase BEFORE package resolution?
2. **Script Paths:** Are `${SRCROOT}` paths correct?
3. **Node.js Available:** Is Node.js available in Xcode Cloud?
4. **Script Output:** Check build logs for script errors

## Environment Variables (Optional)

You generally don't need environment variables in the Xcode Cloud settings for this fix. The build phase script handles everything.

However, if you need to pass configuration:

1. In the Xcode Cloud workflow settings
2. Click "Add" under Environment Variables
3. Add any required variables (e.g., `NODE_VERSION`)

## Summary

**The fix:** Add a Run Script build phase that installs npm dependencies BEFORE SPM resolves packages. This ensures `node_modules` exists when SPM needs it.
