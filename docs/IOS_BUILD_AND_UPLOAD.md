# iOS Build and Upload Guide

This guide covers building and uploading iOS builds to App Store Connect for the Synth app.

## Prerequisites

1. **Xcode** - Latest version installed from the Mac App Store
2. **Xcode Command Line Tools** - Install via: `xcode-select --install`
3. **Apple Developer Account** - Active membership required
4. **App Store Connect Access** - Account Holder, Admin, App Manager, or Developer role
5. **Node.js and npm** - For building web assets and Capacitor sync

## Bundle ID Configuration

**Important:** Ensure your Bundle ID matches App Store Connect:
- **App Store Connect:** `com.tejpatel.synth`
- **Current Xcode Project:** `com.synth.app`

If these don't match, you'll need to update the Bundle ID in Xcode:
1. Open `ios/App/App.xcodeproj` in Xcode
2. Select the project in the navigator
3. Select the "App" target
4. Go to "Signing & Capabilities"
5. Update "Bundle Identifier" to `com.tejpatel.synth`

## Build Process Overview

The iOS build process involves several steps:

1. **Build Web Assets** - Compile React/Vite frontend
2. **Sync Capacitor** - Copy web assets to iOS project
3. **Archive** - Create Xcode archive (.xcarchive)
4. **Export IPA** - Generate distributable .ipa file
5. **Upload** - Send to App Store Connect for processing

## Automated Build Script

We provide an automated script to handle the entire process:

```bash
# Build and upload to App Store Connect
./scripts/build-and-upload-ios.sh

# Build only (skip upload)
./scripts/build-and-upload-ios.sh --skip-upload

# Use custom scheme or configuration
./scripts/build-and-upload-ios.sh --scheme App --configuration Release
```

### Script Options

- `--skip-upload` - Build only, don't upload to App Store Connect
- `--scheme SCHEME` - Xcode scheme name (default: "App")
- `--configuration CONFIG` - Build configuration (default: "Release")

## Manual Build Process

If you prefer to build manually or need more control:

### Step 1: Build Web Assets

```bash
npm run build
```

### Step 2: Sync Capacitor

```bash
npx cap sync ios
```

### Step 3: Open in Xcode

```bash
npx cap open ios
```

Or manually:
```bash
open ios/App/App.xcodeproj
```

### Step 4: Configure Signing

In Xcode:
1. Select the project in the navigator
2. Select the "App" target
3. Go to "Signing & Capabilities"
4. Enable "Automatically manage signing"
5. Select your Team
6. Verify Bundle Identifier matches App Store Connect

### Step 5: Archive

1. In Xcode, select "Any iOS Device" as the destination
2. Go to **Product > Archive**
3. Wait for the archive to complete
4. The Organizer window will open automatically

### Step 6: Distribute App

1. In the Organizer, select your archive
2. Click **Distribute App**
3. Choose **App Store Connect**
4. Select **Upload**
5. Follow the prompts to:
   - Choose distribution options
   - Review app information
   - Upload to App Store Connect

## Upload Methods

### Method 1: Xcode (Recommended for First-Time Setup)

1. Archive your app in Xcode
2. Use the Organizer to distribute
3. Follow the guided upload process

### Method 2: Transporter App

1. Download [Transporter](https://apps.apple.com/app/transporter/id1450874784) from the Mac App Store
2. Export your IPA from Xcode (Product > Archive > Distribute App > Export)
3. Drag and drop the IPA into Transporter
4. Sign in with your Apple ID
5. Click "Deliver"

### Method 3: Command Line (xcrun altool)

```bash
xcrun altool --upload-app \
  --type ios \
  --file path/to/your/app.ipa \
  --username your-apple-id@example.com \
  --password your-app-specific-password
```

**Note:** You'll need an [app-specific password](https://appleid.apple.com/account/manage) for your Apple ID.

### Method 4: Transporter CLI with API Key (Recommended for CI/CD)

For automated builds, use the App Store Connect API with JWT authentication:

1. **Create an API Key:**
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Users and Access > Keys > App Store Connect API
   - Create a new key with "Developer" or "App Manager" role
   - Download the `.p8` key file (you can only download it once!)

2. **Upload using Transporter CLI:**

```bash
xcrun altool --upload-app \
  --type ios \
  --file path/to/your/app.ipa \
  --apiKey YOUR_KEY_ID \
  --apiIssuer YOUR_ISSUER_ID
```

Or use the newer `xcrun notarytool` for notarization (macOS only, but similar process).

## Build Processing

After uploading:

1. **Processing Time:** Apple typically processes builds within 10-30 minutes
2. **Email Notification:** You'll receive an email when processing is complete
3. **App Store Connect:** The build will appear in your app's version record
4. **Build String:** Each build is uniquely identified by its build string (CFBundleVersion)

## Version and Build Numbers

The build system uses:
- **Version (CFBundleShortVersionString):** Marketing version (e.g., "1.0")
- **Build (CFBundleVersion):** Build number (e.g., "1", "2", "3")

Both are defined in:
- `ios/App/App.xcodeproj/project.pbxproj` (MARKETING_VERSION and CURRENT_PROJECT_VERSION)
- `ios/App/App/Info.plist` (references the project settings)

**Important:** Each upload must have a unique build number that's higher than previous builds.

## Troubleshooting

### Build Fails with Signing Errors

1. Check your Apple Developer account membership
2. Verify your Team is selected in Xcode
3. Ensure Bundle ID matches App Store Connect
4. Try cleaning the build folder (Product > Clean Build Folder)

### Upload Fails with Authentication Errors

1. Verify your Apple ID has the correct role in App Store Connect
2. For app-specific passwords, ensure 2FA is enabled
3. Check that your API key has the correct permissions
4. Verify the API key hasn't expired

### Build Not Appearing in App Store Connect

1. Wait 10-30 minutes for processing
2. Check your email for error notifications
3. Verify the Bundle ID matches exactly
4. Check that the version/build number is unique and higher than previous builds

### Capacitor Sync Issues

```bash
# Clean and re-sync
rm -rf ios/App/App/App/public
npx cap sync ios
```

### Xcode Build Errors

1. Clean build folder: Product > Clean Build Folder (Shift+Cmd+K)
2. Delete derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData`
3. Update CocoaPods (if used): `cd ios && pod install`
4. Check for Swift version compatibility

## CI/CD Integration

For automated builds, consider:

1. **GitHub Actions** - Use `xcodebuild` commands
2. **Fastlane** - Popular iOS automation tool
3. **Xcode Cloud** - Apple's CI/CD solution
4. **Jenkins/CircleCI** - Custom CI/CD pipelines

Example GitHub Actions workflow:

```yaml
name: Build and Upload iOS

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npx cap sync ios
      - run: |
          xcodebuild archive \
            -project ios/App/App.xcodeproj \
            -scheme App \
            -archivePath build/App.xcarchive
      - run: |
          xcodebuild -exportArchive \
            -archivePath build/App.xcarchive \
            -exportPath build \
            -exportOptionsPlist exportOptions.plist
      - uses: apple-actions/upload-testflight-build@v1
        with:
          app-path: 'build/App.ipa'
          issuer-id: ${{ secrets.APPSTORE_ISSUER_ID }}
          api-key-id: ${{ secrets.APPSTORE_API_KEY_ID }}
          api-private-key: ${{ secrets.APPSTORE_API_PRIVATE_KEY }}
```

## Best Practices

1. **Increment Build Numbers:** Always increment CFBundleVersion for each upload
2. **Test Before Upload:** Test on physical devices before uploading
3. **Version Management:** Use semantic versioning for marketing versions
4. **Automate:** Set up CI/CD for consistent builds
5. **Document Changes:** Keep a changelog for each build
6. **Backup Archives:** Keep local archives for rollback if needed

## Related Documentation

- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Xcode Build System](https://developer.apple.com/documentation/xcode)
- [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
- [Capacitor iOS Guide](https://capacitorjs.com/docs/ios)

## Support

For issues:
1. Check Xcode build logs
2. Review App Store Connect build status
3. Check Apple Developer Forums
4. Review Capacitor documentation
