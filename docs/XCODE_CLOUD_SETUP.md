# Xcode Cloud Setup Guide

This guide explains how to configure Xcode Cloud for building the Synth iOS app.

## Overview

Xcode Cloud is Apple's CI/CD service that automatically builds, tests, and distributes your iOS apps. For Capacitor apps, we need to ensure npm dependencies are installed before Xcode resolves Swift Package Manager dependencies.

## Problem

The iOS project uses Capacitor packages that are installed via npm. These packages are referenced in `Package.swift` using relative paths to `node_modules`. If `node_modules` doesn't exist when Xcode tries to resolve dependencies, the build fails with errors like:

```
the package at '/path/to/node_modules/@capacitor/app' cannot be accessed
(Error Domain=NSCocoaErrorDomain Code=260 "The folder "app" doesn't exist.")
```

## Solution

We use Xcode Cloud's pre-build script (`ci_scripts/ci_pre_xcodebuild.sh`) to install npm dependencies before Xcode builds.

## Xcode Cloud Scripts

Xcode Cloud automatically looks for scripts in the `ci_scripts/` directory:

### `ci_pre_xcodebuild.sh`

This script runs **before** Xcode builds. It:
1. Installs npm dependencies (`npm ci`)
2. Verifies all Capacitor packages are present
3. Syncs Capacitor (optional)
4. Ensures `node_modules` exists before Xcode resolves dependencies

### Script Location

```
ci_scripts/
  └── ci_pre_xcodebuild.sh
```

The script must be:
- Executable (`chmod +x`)
- In the `ci_scripts/` directory at the project root
- Named exactly `ci_pre_xcodebuild.sh`

## Setting Up Xcode Cloud

### 1. Enable Xcode Cloud

1. Open your project in Xcode
2. Go to **Xcode Cloud** tab (or **Product > Xcode Cloud**)
3. Click **Get Started** or **Create Workflow**
4. Follow the setup wizard

### 2. Configure Workflow

When creating a workflow:

1. **Select Scheme:** Choose "App" scheme
2. **Select Platform:** iOS
3. **Build Configuration:** Release (for production builds)
4. **Archive:** Enable if you want to create archives

### 3. Environment Variables (if needed)

If your build requires environment variables:

1. Go to workflow settings
2. Add environment variables under **Environment Variables**
3. Common variables:
   - `NODE_VERSION` (if you need a specific Node.js version)
   - Any build-time configuration

### 4. Verify Pre-Build Script

The `ci_pre_xcodebuild.sh` script should be automatically detected. Verify:

1. In Xcode Cloud workflow settings
2. Check that the script appears in the build logs
3. Look for "🚀 Starting pre-build setup..." in logs

## How It Works

### Build Process Flow

1. **Xcode Cloud starts build**
2. **Pre-build script runs** (`ci_pre_xcodebuild.sh`):
   - Installs npm dependencies
   - Verifies Capacitor packages
   - Syncs Capacitor
3. **Xcode resolves Swift Package Manager dependencies:**
   - Reads `Package.swift`
   - Finds Capacitor packages in `node_modules`
   - Links them to the project
4. **Xcode builds the app**
5. **Post-build (optional):** Run tests, upload to TestFlight, etc.

### Script Execution

The script runs in the project root directory. Xcode Cloud sets these environment variables:

- `CI_WORKSPACE` - Path to the workspace
- `CI_PROJECT_DIR` - Path to the project directory
- `CI_DERIVED_DATA_PATH` - Path to derived data

## Troubleshooting

### Build Fails: "Cannot access package"

**Problem:** `node_modules` doesn't exist when Xcode resolves dependencies.

**Solution:**
1. Verify `ci_pre_xcodebuild.sh` exists and is executable
2. Check build logs for pre-build script output
3. Ensure script runs successfully (look for "✅ Pre-build setup complete!")
4. Check that `npm ci` completes without errors

### npm install Fails

**Problem:** npm install fails in pre-build script.

**Possible causes:**
- `package-lock.json` is missing or corrupted
- Network issues in Xcode Cloud
- Node.js version incompatibility

**Solution:**
1. Commit `package-lock.json` to repository
2. Check build logs for specific npm errors
3. Verify Node.js version in Xcode Cloud (should be latest LTS)

### Capacitor Packages Still Missing

**Problem:** Script runs but packages still not found.

**Solution:**
1. Check build logs - verify packages are listed as "✅ Found"
2. Verify `node_modules/@capacitor/` directory exists
3. Check `Package.swift` paths are correct relative paths
4. Ensure script completes successfully (exit code 0)

### Script Not Running

**Problem:** Pre-build script doesn't appear to run.

**Solution:**
1. Verify script is in `ci_scripts/` directory at project root
2. Verify script is executable (`chmod +x`)
3. Check script name is exactly `ci_pre_xcodebuild.sh`
4. Verify script is committed to repository
5. Check Xcode Cloud build logs for script execution

## Build Logs

### Successful Build Logs

You should see in the build logs:

```
🚀 Starting pre-build setup...
📁 Project root: /Volumes/workspace/repository
✅ Node.js version: v20.x.x
✅ npm version: 10.x.x
📦 Installing npm dependencies...
✅ Found: @capacitor/app
✅ Found: @capacitor/push-notifications
✅ Found: @capacitor/splash-screen
✅ Found: @capacitor/status-bar
✅ All dependencies installed successfully!
✅ Pre-build setup complete!
```

### Failed Build Logs

If something fails, you'll see:

```
❌ Error: [specific error message]
```

Check the error message and refer to troubleshooting section.

## Manual Testing

To test the script locally (simulating Xcode Cloud):

```bash
# Set environment variables (optional)
export CI_WORKSPACE=$(pwd)
export CI_PROJECT_DIR=$(pwd)

# Run the script
./ci_scripts/ci_pre_xcodebuild.sh
```

## Alternative: Using npm ci vs npm install

The script uses `npm ci` which:
- Installs exactly from `package-lock.json`
- Faster and more reliable for CI/CD
- Fails if `package-lock.json` is missing
- Cleans `node_modules` before installing

If you prefer `npm install`, you can modify the script, but `npm ci` is recommended for CI/CD.

## Best Practices

1. **Always commit `package-lock.json`** - Required for `npm ci`
2. **Keep script simple** - Only install dependencies, don't build
3. **Verify in logs** - Check that script runs successfully
4. **Test locally first** - Run script manually before pushing
5. **Monitor build times** - npm install can take time, consider caching

## Caching (Advanced)

To speed up builds, you can cache `node_modules`:

1. In Xcode Cloud workflow settings
2. Add a cache step (if available in your plan)
3. Cache `node_modules` directory

However, Xcode Cloud may handle this automatically.

## Related Documentation

- [iOS Build and Upload Guide](./IOS_BUILD_AND_UPLOAD.md)
- [iOS Dependency Troubleshooting](./IOS_DEPENDENCY_TROUBLESHOOTING.md)
- [Xcode Cloud Documentation](https://developer.apple.com/documentation/xcode)
- [Capacitor iOS Guide](https://capacitorjs.com/docs/ios)

## Support

If issues persist:
1. Check Xcode Cloud build logs
2. Verify script runs locally
3. Check Capacitor and Xcode Cloud documentation
4. Review troubleshooting section above
