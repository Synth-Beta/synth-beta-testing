#!/bin/bash

# iOS Build and Upload Script for App Store Connect
# This script builds the iOS app and uploads it to App Store Connect
# 
# Usage:
#   ./scripts/build-and-upload-ios.sh [--skip-upload] [--scheme SCHEME] [--configuration CONFIG]
#
# Options:
#   --skip-upload    Build only, don't upload to App Store Connect
#   --scheme         Xcode scheme name (default: App)
#   --configuration  Build configuration (default: Release)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
SCHEME="App"
CONFIGURATION="Release"
SKIP_UPLOAD=false
WORKSPACE_PATH="ios/App/App.xcodeproj"
ARCHIVE_PATH="build/ios/archive"
EXPORT_PATH="build/ios/export"
IPA_PATH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-upload)
      SKIP_UPLOAD=true
      shift
      ;;
    --scheme)
      SCHEME="$2"
      shift 2
      ;;
    --configuration)
      CONFIGURATION="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Check prerequisites
echo -e "${GREEN}Checking prerequisites...${NC}"

# Step 0: Ensure dependencies are installed
echo -e "${GREEN}Step 0: Checking dependencies...${NC}"
if [ ! -d "node_modules" ] || [ ! -d "node_modules/@capacitor" ]; then
  echo -e "${YELLOW}node_modules not found or incomplete. Installing dependencies...${NC}"
  if npm install; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
  else
    echo -e "${RED}Error: Failed to install dependencies${NC}"
    exit 1
  fi
else
  echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Verify Capacitor packages exist
echo -e "${GREEN}Verifying Capacitor packages...${NC}"
MISSING_PACKAGES=()
for package in "@capacitor/app" "@capacitor/push-notifications" "@capacitor/splash-screen" "@capacitor/status-bar"; do
  if [ ! -d "node_modules/$package" ]; then
    MISSING_PACKAGES+=("$package")
  fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
  echo -e "${RED}Error: Missing Capacitor packages:${NC}"
  for package in "${MISSING_PACKAGES[@]}"; do
    echo -e "${RED}  - $package${NC}"
  done
  echo -e "${YELLOW}Reinstalling dependencies...${NC}"
  npm install
  if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install missing packages${NC}"
    exit 1
  fi
fi

echo ""

# Warning about bundle ID mismatch
BUNDLE_ID_PROJECT="com.synth.app"
BUNDLE_ID_APPSTORE="com.tejpatel.synth"
if [ "$BUNDLE_ID_PROJECT" != "$BUNDLE_ID_APPSTORE" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Bundle ID mismatch detected!${NC}"
  echo -e "${YELLOW}   Project Bundle ID: $BUNDLE_ID_PROJECT${NC}"
  echo -e "${YELLOW}   App Store Connect: $BUNDLE_ID_APPSTORE${NC}"
  echo -e "${YELLOW}   Update the Bundle ID in Xcode to match App Store Connect.${NC}"
  echo ""
fi

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
  echo -e "${RED}Error: xcodebuild not found. Please install Xcode.${NC}"
  exit 1
fi

# Check if xcrun altool or xcrun notarytool is available
if ! command -v xcrun &> /dev/null; then
  echo -e "${RED}Error: xcrun not found. Please install Xcode Command Line Tools.${NC}"
  exit 1
fi

# Check if Capacitor is installed
if ! command -v npx &> /dev/null; then
  echo -e "${RED}Error: npx not found. Please install Node.js.${NC}"
  exit 1
fi

# Check if we're in the project root
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Please run this script from the project root directory.${NC}"
  exit 1
fi

# Step 1: Build web assets
echo -e "${GREEN}Step 1: Building web assets...${NC}"
if ! npm run build; then
  echo -e "${RED}Error: Build failed. Please check the errors above.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Build successful${NC}"

# Step 2: Sync Capacitor
echo -e "${GREEN}Step 2: Syncing Capacitor...${NC}"
if ! npx cap sync ios; then
  echo -e "${RED}Error: Capacitor sync failed. Please check the errors above.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Capacitor sync successful${NC}"

# Step 3: Create build directories
echo -e "${GREEN}Step 3: Preparing build directories...${NC}"
mkdir -p "$ARCHIVE_PATH"
mkdir -p "$EXPORT_PATH"

# Step 4: Clean build folder
echo -e "${GREEN}Step 4: Cleaning previous builds...${NC}"
xcodebuild clean \
  -project "$WORKSPACE_PATH" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -quiet

# Step 5: Archive the app
echo -e "${GREEN}Step 5: Archiving the app...${NC}"
ARCHIVE_FILE="$ARCHIVE_PATH/${SCHEME}.xcarchive"

# Check if xcpretty is available for prettier output
if command -v xcpretty &> /dev/null; then
  xcodebuild archive \
    -project "$WORKSPACE_PATH" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -archivePath "$ARCHIVE_FILE" \
    -destination "generic/platform=iOS" \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    | xcpretty || true
else
  echo -e "${YELLOW}Note: xcpretty not found. Install with: gem install xcpretty (optional)${NC}"
  xcodebuild archive \
    -project "$WORKSPACE_PATH" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -archivePath "$ARCHIVE_FILE" \
    -destination "generic/platform=iOS" \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO
fi

if [ ! -d "$ARCHIVE_FILE" ]; then
  echo -e "${RED}Error: Archive failed. Check the build output above.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Archive created successfully at: $ARCHIVE_FILE${NC}"

# Step 6: Export IPA
echo -e "${GREEN}Step 6: Exporting IPA...${NC}"

# Create export options plist
EXPORT_OPTIONS_PLIST="$EXPORT_PATH/ExportOptions.plist"
cat > "$EXPORT_OPTIONS_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>\$(DEVELOPMENT_TEAM)</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>stripSwiftSymbols</key>
    <true/>
</dict>
</plist>
EOF

# Check if xcpretty is available for prettier output
if command -v xcpretty &> /dev/null; then
  xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_FILE" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
    | xcpretty || true
else
  xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_FILE" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PLIST"
fi

# Find the IPA file
IPA_PATH=$(find "$EXPORT_PATH" -name "*.ipa" | head -n 1)

if [ -z "$IPA_PATH" ] || [ ! -f "$IPA_PATH" ]; then
  echo -e "${RED}Error: IPA export failed. Check the build output above.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ IPA exported successfully at: $IPA_PATH${NC}"

# Step 7: Upload to App Store Connect (if not skipped)
if [ "$SKIP_UPLOAD" = false ]; then
  echo -e "${GREEN}Step 7: Uploading to App Store Connect...${NC}"
  echo -e "${YELLOW}Note: You'll need to authenticate with your Apple ID.${NC}"
  echo -e "${YELLOW}You can use:${NC}"
  echo -e "${YELLOW}  - App-specific password (recommended)${NC}"
  echo -e "${YELLOW}  - API key (JWT) with Transporter${NC}"
  echo ""
  
  # Try using xcrun altool (older method, still works)
  if xcrun altool --version &> /dev/null; then
    echo -e "${YELLOW}Using xcrun altool...${NC}"
    echo -e "${YELLOW}Enter your Apple ID email:${NC}"
    read -r APPLE_ID
    echo -e "${YELLOW}Enter your app-specific password:${NC}"
    read -rs APP_SPECIFIC_PASSWORD
    
    xcrun altool --upload-app \
      --type ios \
      --file "$IPA_PATH" \
      --username "$APPLE_ID" \
      --password "$APP_SPECIFIC_PASSWORD" \
      --verbose
    
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✓ Upload successful!${NC}"
      echo -e "${GREEN}Your build is being processed by Apple. You'll receive an email when it's ready.${NC}"
    else
      echo -e "${RED}Upload failed. Check the error messages above.${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}Using xcrun notarytool (recommended for newer Xcode versions)...${NC}"
    echo -e "${YELLOW}For notarytool, you'll need to use an API key.${NC}"
    echo -e "${YELLOW}See: https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api${NC}"
    echo ""
    echo -e "${YELLOW}Alternatively, you can upload manually using:${NC}"
    echo -e "${YELLOW}  1. Xcode: Window > Organizer > Archives > Distribute App${NC}"
    echo -e "${YELLOW}  2. Transporter app: https://apps.apple.com/app/transporter/id1450874784${NC}"
    echo -e "${YELLOW}  3. Command line: xcrun altool (as shown above)${NC}"
    echo ""
    echo -e "${GREEN}IPA file is ready at: $IPA_PATH${NC}"
  fi
else
  echo -e "${GREEN}✓ Build complete. Upload skipped.${NC}"
  echo -e "${GREEN}IPA file is ready at: $IPA_PATH${NC}"
fi

echo ""
echo -e "${GREEN}Build Summary:${NC}"
echo -e "  Archive: $ARCHIVE_FILE"
echo -e "  IPA: $IPA_PATH"
echo -e "  Scheme: $SCHEME"
echo -e "  Configuration: $CONFIGURATION"
