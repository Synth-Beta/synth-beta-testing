#!/bin/bash

# Simple iOS Build and Sync Script
# Builds web assets and syncs with Capacitor iOS project
#
# Usage:
#   ./scripts/build-and-sync-ios.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building iOS app...${NC}"
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Please run this script from the project root directory.${NC}"
  exit 1
fi

# Check if Node.js is installed
if ! command -v npm &> /dev/null; then
  echo -e "${RED}Error: npm not found. Please install Node.js.${NC}"
  exit 1
fi

# Check if Capacitor CLI is available
if ! command -v npx &> /dev/null; then
  echo -e "${RED}Error: npx not found. Please install Node.js.${NC}"
  exit 1
fi

# Step 0: Ensure dependencies are installed
echo -e "${GREEN}Step 0: Checking dependencies...${NC}"
if [ ! -d "node_modules" ] || [ ! -d "node_modules/@capacitor" ]; then
  echo -e "${YELLOW}node_modules not found or incomplete. Installing dependencies...${NC}"
  if npm install; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
  else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
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
    echo -e "${RED}✗ Failed to install missing packages${NC}"
    exit 1
  fi
fi

echo ""

# Step 1: Build web assets
echo -e "${GREEN}Step 1: Building web assets...${NC}"
if npm run build; then
  echo -e "${GREEN}✓ Build successful${NC}"
else
  echo -e "${RED}✗ Build failed${NC}"
  exit 1
fi

echo ""

# Step 2: Sync Capacitor
echo -e "${GREEN}Step 2: Syncing Capacitor iOS...${NC}"
if npx cap sync ios; then
  echo -e "${GREEN}✓ Capacitor sync successful${NC}"
else
  echo -e "${RED}✗ Capacitor sync failed${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✓ Build and sync complete!${NC}"
echo -e "${GREEN}You can now open the project in Xcode with:${NC}"
echo -e "${YELLOW}  npx cap open ios${NC}"
echo -e "${YELLOW}  or${NC}"
echo -e "${YELLOW}  open ios/App/App.xcodeproj${NC}"
