#!/bin/bash

# Test script that simulates what the Xcode Build Phase script would do
# This tests the logic before adding it to the Xcode project

set -e

# Simulate SRCROOT (in Xcode, this would be set automatically)
SRCROOT="${1:-ios/App/App}"

echo "🧪 Testing Build Phase Script Logic"
echo "======================================"
echo "SRCROOT: $SRCROOT"

# Get project root (3 levels up from SRCROOT)
PROJECT_ROOT="${SRCROOT}/../../.."
echo "PROJECT_ROOT (calculated): $PROJECT_ROOT"

# Navigate to project root
cd "${PROJECT_ROOT}"
ACTUAL_ROOT=$(pwd)
echo "ACTUAL_ROOT (resolved): $ACTUAL_ROOT"
echo ""

echo "📦 Checking npm dependencies..."

# Only run if node_modules doesn't exist
if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
  echo "📦 Installing npm dependencies (required for SPM resolution)..."
  cd "${PROJECT_ROOT}"
  
  # Check if package.json exists
  if [ -f "package.json" ]; then
    if [ -f "package-lock.json" ]; then
      echo "   Found package-lock.json, using npm ci..."
      npm ci --prefer-offline --no-audit || {
        echo "   npm ci failed, trying npm install..."
        npm install --no-audit
      }
    else
      echo "   No package-lock.json, using npm install..."
      npm install --no-audit
    fi
    
    # Verify Capacitor packages exist
    if [ ! -d "node_modules/@capacitor/app" ]; then
      echo "❌ Error: Capacitor packages not installed"
      exit 1
    fi
    
    echo "✅ npm dependencies installed successfully"
  else
    echo "⚠️  Warning: package.json not found at ${PROJECT_ROOT}"
    exit 1
  fi
else
  echo "✅ node_modules already exists"
fi

# Verify all required Capacitor packages
echo ""
echo "🔍 Verifying Capacitor packages:"

REQUIRED_PACKAGES=(
  "@capacitor/app"
  "@capacitor/push-notifications"
  "@capacitor/splash-screen"
  "@capacitor/status-bar"
)

ALL_FOUND=true
for package in "${REQUIRED_PACKAGES[@]}"; do
  if [ -d "node_modules/$package" ]; then
    echo "   ✅ Found: $package"
  else
    echo "   ❌ Missing: $package"
    ALL_FOUND=false
  fi
done

# Verify Package.swift paths resolve correctly
echo ""
echo "🔍 Verifying Package.swift paths:"
PACKAGE_SWIFT_DIR="ios/App/CapApp-SPM"
cd "${PROJECT_ROOT}/${PACKAGE_SWIFT_DIR}"

for package in "${REQUIRED_PACKAGES[@]}"; do
  RELATIVE_PATH="../../../node_modules/$package"
  if [ -d "$RELATIVE_PATH" ]; then
    echo "   ✅ Package.swift can access: $package"
  else
    echo "   ❌ Package.swift CANNOT access: $package"
    echo "      Expected path: $RELATIVE_PATH"
    echo "      From: $(pwd)"
    ALL_FOUND=false
  fi
done

if [ "$ALL_FOUND" = true ]; then
  echo ""
  echo "✅ All tests passed! Build phase script logic is correct."
  exit 0
else
  echo ""
  echo "❌ Some tests failed. Please check the errors above."
  exit 1
fi
