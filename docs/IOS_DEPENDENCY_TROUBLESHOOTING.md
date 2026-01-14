# iOS Dependency Troubleshooting Guide

This guide helps resolve common iOS build errors related to Capacitor package dependencies.

## Common Error: "Cannot access package" or "Folder doesn't exist"

### Error Message
```
Could not resolve package dependencies: 
the package at '/path/to/node_modules/@capacitor/app' cannot be accessed 
(Error Domain=NSCocoaErrorDomain Code=260 "The folder "app" doesn't exist.")
```

### Root Cause
This error occurs when:
1. `node_modules` directory is missing or incomplete
2. Capacitor packages aren't installed
3. Paths in `Package.swift` don't resolve correctly
4. Build is running before `npm install` completes

## Quick Fix

Run the dependency fix script:

```bash
npm run ios:fix-deps
```

Or manually:

```bash
./scripts/fix-ios-dependencies.sh
```

This script will:
1. Install/reinstall all npm dependencies
2. Verify all Capacitor packages are present
3. Check Package.swift paths
4. Sync Capacitor

## Step-by-Step Solution

### Step 1: Install Dependencies

```bash
npm install
```

Verify installation:
```bash
ls node_modules/@capacitor/
```

You should see:
- `app/`
- `push-notifications/`
- `splash-screen/`
- `status-bar/`
- `core/`
- `ios/`
- `cli/`

### Step 2: Verify Package.swift Paths

Check that `ios/App/CapApp-SPM/Package.swift` has correct relative paths:

```swift
.package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
.package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications"),
.package(name: "CapacitorSplashScreen", path: "../../../node_modules/@capacitor/splash-screen"),
.package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar")
```

The path `../../../node_modules` should resolve from:
- `ios/App/CapApp-SPM/Package.swift` 
- Up 3 levels to project root
- Then into `node_modules/`

### Step 3: Sync Capacitor

```bash
npx cap sync ios
```

This updates the iOS project with the latest Capacitor configuration.

### Step 4: Clean Xcode Build

If issues persist:

1. **Clean Xcode build folder:**
   ```bash
   xcodebuild clean -project ios/App/App.xcodeproj -scheme App
   ```

2. **Delete derived data:**
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData
   ```

3. **Reset package cache:**
   ```bash
   rm -rf ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
   ```

4. **Reopen in Xcode:**
   ```bash
   npx cap open ios
   ```

   In Xcode: File > Packages > Reset Package Caches

## CI/CD Environments

If you're seeing this error in CI/CD (like `/Volumes/workspace/repository/`):

### Xcode Cloud

If you're using **Xcode Cloud**, we have a pre-build script that automatically installs dependencies:

**Location:** `ci_scripts/ci_pre_xcodebuild.sh`

This script:
- Automatically runs before Xcode builds
- Installs npm dependencies
- Verifies Capacitor packages
- Ensures `node_modules` exists before package resolution

**Setup:**
1. The script is already in the repository
2. Xcode Cloud automatically detects and runs it
3. No additional configuration needed

**Verify it's working:**
- Check build logs for "🚀 Starting pre-build setup..."
- Look for "✅ Pre-build setup complete!" in logs

See [Xcode Cloud Setup Guide](./XCODE_CLOUD_SETUP.md) for details.

### Other CI/CD (GitHub Actions, etc.)

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Install dependencies
  run: npm ci  # or npm install

- name: Sync Capacitor
  run: npx cap sync ios

- name: Build iOS
  run: xcodebuild ...
```

### Check workspace paths

The error path `/Volumes/workspace/repository/` suggests:
- The workspace is mounted at a different location
- Relative paths in `Package.swift` might not resolve correctly
- Ensure `node_modules` exists at the expected location

### Fix for CI/CD

1. **Verify node_modules location:**
   ```bash
   pwd
   ls -la node_modules/@capacitor/
   ```

2. **Ensure build runs from project root:**
   ```bash
   cd /path/to/project/root
   npm install
   npx cap sync ios
   ```

3. **For Xcode Cloud:** The pre-build script handles this automatically

## Prevention

### Always run in this order:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build web assets:**
   ```bash
   npm run build
   ```

3. **Sync Capacitor:**
   ```bash
   npx cap sync ios
   ```

4. **Then build iOS:**
   ```bash
   npm run ios:build
   # or open in Xcode
   ```

### Use the provided scripts

The build scripts now automatically:
- Check for dependencies
- Install if missing
- Verify packages before building

```bash
npm run ios:sync      # Build and sync (includes dependency check)
npm run ios:upload   # Full build and upload (includes dependency check)
```

## Verification Checklist

After fixing, verify:

- [ ] `node_modules/@capacitor/` directory exists
- [ ] All required packages are in `node_modules/@capacitor/`
- [ ] `Package.swift` paths are correct relative paths
- [ ] `npx cap sync ios` completes without errors
- [ ] Xcode can resolve packages (no red errors in project navigator)

## Still Having Issues?

### Check Xcode Package Resolution

1. Open project in Xcode:
   ```bash
   npx cap open ios
   ```

2. In Xcode:
   - File > Packages > Reset Package Caches
   - File > Packages > Update to Latest Package Versions
   - Product > Clean Build Folder (Shift+Cmd+K)

### Check Package.swift

The file `ios/App/CapApp-SPM/Package.swift` is auto-generated by Capacitor. If you manually edit it, it will be overwritten.

To regenerate:
```bash
npx cap sync ios
```

### Check Capacitor Version

Ensure all Capacitor packages are the same version:

```bash
npm list @capacitor/core @capacitor/ios @capacitor/app
```

All should show the same version (e.g., `8.0.0`).

### Reinstall Everything

Nuclear option - start fresh:

```bash
# Remove node_modules and package-lock
rm -rf node_modules package-lock.json

# Remove iOS build artifacts
rm -rf ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm

# Reinstall
npm install

# Re-sync
npx cap sync ios
```

## Related Documentation

- [iOS Build and Upload Guide](./IOS_BUILD_AND_UPLOAD.md)
- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [Swift Package Manager Documentation](https://www.swift.org/package-manager/)
