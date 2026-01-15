#!/bin/bash

# Fix iOS Dependencies Script
# Ensures all Capacitor packages are properly installed for iOS builds
#
# Usage:
#   ./scripts/fix-ios-dependencies.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Fixing iOS dependencies...${NC}"
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

# Step 1: Install/Reinstall dependencies
echo -e "${GREEN}Step 1: Installing dependencies...${NC}"
npm install

if [ $? -ne 0 ]; then
  echo -e "${RED}✗ Failed to install dependencies${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 2: Verify Capacitor packages
echo -e "${GREEN}Step 2: Verifying Capacitor packages...${NC}"

REQUIRED_PACKAGES=(
  "@capacitor/app"
  "@capacitor/push-notifications"
  "@capacitor/splash-screen"
  "@capacitor/status-bar"
  "@capacitor/core"
  "@capacitor/ios"
  "@capacitor/cli"
)

MISSING_PACKAGES=()
for package in "${REQUIRED_PACKAGES[@]}"; do
  if [ ! -d "node_modules/$package" ]; then
    MISSING_PACKAGES+=("$package")
    echo -e "${RED}✗ Missing: $package${NC}"
  else
    echo -e "${GREEN}✓ Found: $package${NC}"
  fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}Some packages are missing. Reinstalling...${NC}"
  npm install "${MISSING_PACKAGES[@]}"
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to install missing packages${NC}"
    exit 1
  fi
fi

echo ""

# Step 3: Verify Package.swift paths
echo -e "${GREEN}Step 3: Verifying Package.swift paths...${NC}"

PACKAGE_SWIFT="ios/App/CapApp-SPM/Package.swift"
if [ ! -f "$PACKAGE_SWIFT" ]; then
  echo -e "${RED}Error: Package.swift not found at $PACKAGE_SWIFT${NC}"
  exit 1
fi

# Check if paths in Package.swift are correct
PROJECT_ROOT=$(pwd)
EXPECTED_NODE_MODULES="$PROJECT_ROOT/node_modules"

# Verify each package path
PACKAGES_TO_CHECK=(
  "@capacitor/app"
  "@capacitor/push-notifications"
  "@capacitor/splash-screen"
  "@capacitor/status-bar"
)

ALL_PATHS_VALID=true
for package in "${PACKAGES_TO_CHECK[@]}"; do
  PACKAGE_PATH="$EXPECTED_NODE_MODULES/$package"
  if [ ! -d "$PACKAGE_PATH" ]; then
    echo -e "${RED}✗ Package path invalid: $PACKAGE_PATH${NC}"
    ALL_PATHS_VALID=false
  else
    echo -e "${GREEN}✓ Package path valid: $package${NC}"
  fi
done

if [ "$ALL_PATHS_VALID" = false ]; then
  echo ""
  echo -e "${YELLOW}Some package paths are invalid. This might be a path resolution issue.${NC}"
  echo -e "${YELLOW}Try running: npx cap sync ios${NC}"
fi

echo ""

# Step 4: Sync Capacitor
echo -e "${GREEN}Step 4: Syncing Capacitor...${NC}"
if npx cap sync ios; then
  echo -e "${GREEN}✓ Capacitor sync successful${NC}"
else
  echo -e "${RED}✗ Capacitor sync failed${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✓ All dependencies fixed!${NC}"
echo -e "${GREEN}You can now build your iOS app.${NC}"
