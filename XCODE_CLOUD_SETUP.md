# Xcode Cloud Setup Guide

This guide helps you configure Xcode Cloud for this Capacitor iOS project.

## Problem

Xcode Cloud fails to resolve Swift Package Manager dependencies because it tries to resolve Capacitor packages from `node_modules/@capacitor/*` before npm dependencies are installed.

## Solution

A pre-build script (`ci_scripts/ci_pre_xcodebuild.sh`) has been created that installs npm dependencies before Xcode attempts to resolve package dependencies.

## Setup Steps

### 1. Verify CI Script is Committed

Make sure the `ci_scripts/ci_pre_xcodebuild.sh` file is committed to your repository:

```bash
git add ci_scripts/ci_pre_xcodebuild.sh
git commit -m "Add Xcode Cloud pre-build script for npm dependencies"
git push
```

### 2. Configure Xcode Cloud

1. Open your Xcode project: `ios/App/App.xcodeproj`
2. Go to **Xcode Cloud** → **Create Workflow** (or edit existing workflow)
3. The CI script will automatically be detected and run before the build

### 3. Verify Build Settings

The workflow should:
- Automatically detect the `ci_scripts/ci_pre_xcodebuild.sh` script
- Run it before resolving Swift Package Manager dependencies
- Install npm dependencies in the repository root

## How It Works

1. **Pre-Build Phase**: The `ci_pre_xcodebuild.sh` script runs first
   - Navigates to repository root (`/Volumes/workspace/repository` in Xcode Cloud)
   - Runs `npm ci` or `npm install` to install all dependencies
   - Verifies that all required Capacitor packages are present

2. **Package Resolution**: Xcode then resolves Swift Package Manager dependencies
   - The `Package.swift` file references Capacitor packages from `node_modules/@capacitor/*`
   - These packages now exist because npm install ran first

3. **Build Phase**: Normal Xcode build proceeds

## Required Capacitor Packages

The following packages must be installed (they're in `package.json`):
- `@capacitor/app`
- `@capacitor/push-notifications`
- `@capacitor/splash-screen`
- `@capacitor/status-bar`

## Troubleshooting

### Error: "The folder doesn't exist"

If you still see errors about missing Capacitor packages:

1. **Check the script is executable**: 
   ```bash
   ls -la ci_scripts/ci_pre_xcodebuild.sh
   ```
   Should show `-rwxr-xr-x` or similar

2. **Verify npm install succeeds**: Check the Xcode Cloud build logs for the pre-build phase

3. **Check package.json**: Ensure all Capacitor packages are listed in dependencies

4. **Verify paths**: The script assumes the repository structure matches:
   ```
   repository/
   ├── package.json
   ├── node_modules/
   │   └── @capacitor/
   │       ├── app/
   │       ├── push-notifications/
   │       ├── splash-screen/
   │       └── status-bar/
   └── ios/
       └── App/
           └── CapApp-SPM/
               └── Package.swift
   ```

### Error: "Node.js is not installed"

Xcode Cloud should have Node.js pre-installed. If you see this error:
- Check Xcode Cloud build environment settings
- Ensure you're using a recent Xcode Cloud environment

## Additional Notes

- The script uses `npm ci` (clean install) which is faster and more reliable for CI
- Falls back to `npm install` if `npm ci` fails
- The script verifies all required packages exist before proceeding
- All output is logged for debugging in Xcode Cloud

## Testing Locally

You can test the script locally (on macOS):

```bash
# Make script executable
chmod +x ci_scripts/ci_pre_xcodebuild.sh

# Run it (it will detect the current directory)
cd /path/to/repository
./ci_scripts/ci_pre_xcodebuild.sh
```

## Next Steps

1. Commit and push the CI script
2. Create or update your Xcode Cloud workflow
3. Trigger a build and verify it succeeds
4. The build should now resolve all Capacitor Swift Package Manager dependencies correctly

