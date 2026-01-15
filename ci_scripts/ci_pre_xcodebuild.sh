#!/bin/bash

# Xcode Cloud Pre-Build Script
# This script runs before Xcode resolves package dependencies
# It ensures npm dependencies are installed so Swift Package Manager can find Capacitor packages
#
# Xcode Cloud automatically runs scripts in ci_scripts/ directory:
# - ci_pre_xcodebuild.sh: Runs before xcodebuild
# - ci_post_xcodebuild.sh: Runs after xcodebuild (optional)

set -e  # Exit on error

# Enable verbose output for debugging
set -x

echo "🚀 Starting pre-build setup..."
echo "=========================================="
echo "Environment Variables:"
echo "CI_WORKSPACE: ${CI_WORKSPACE:-not set}"
echo "CI_PROJECT_DIR: ${CI_PROJECT_DIR:-not set}"
echo "CI_PRIMARY_REPOSITORY_PATH: ${CI_PRIMARY_REPOSITORY_PATH:-not set}"
echo "SRCROOT: ${SRCROOT:-not set}"
echo "PWD: $(pwd)"
echo "=========================================="

# Navigate to repository root
# In Xcode Cloud, the workspace is at /Volumes/workspace/repository
# Try multiple paths to find the repository root
REPO_ROOT=""

# Try Xcode Cloud environment variables first
if [ -n "${CI_WORKSPACE}" ] && [ -f "${CI_WORKSPACE}/package.json" ]; then
    REPO_ROOT="${CI_WORKSPACE}"
elif [ -n "${CI_PRIMARY_REPOSITORY_PATH}" ] && [ -f "${CI_PRIMARY_REPOSITORY_PATH}/package.json" ]; then
    REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH}"
elif [ -n "${CI_PROJECT_DIR}" ] && [ -f "${CI_PROJECT_DIR}/package.json" ]; then
    REPO_ROOT="${CI_PROJECT_DIR}"
elif [ -n "${SRCROOT}" ] && [ -f "${SRCROOT}/../../package.json" ]; then
    REPO_ROOT="${SRCROOT}/../.."
else
    # Try to find package.json by going up from current directory
    CURRENT_DIR=$(pwd)
    while [ "$CURRENT_DIR" != "/" ]; do
        if [ -f "${CURRENT_DIR}/package.json" ]; then
            REPO_ROOT="${CURRENT_DIR}"
            break
        fi
        CURRENT_DIR=$(dirname "$CURRENT_DIR")
    done
fi

if [ -z "$REPO_ROOT" ] || [ ! -f "${REPO_ROOT}/package.json" ]; then
    echo "❌ Error: Could not find repository root (package.json not found)"
    echo "   Tried: CI_WORKSPACE=${CI_WORKSPACE}"
    echo "   Tried: CI_PRIMARY_REPOSITORY_PATH=${CI_PRIMARY_REPOSITORY_PATH}"
    echo "   Tried: CI_PROJECT_DIR=${CI_PROJECT_DIR}"
    echo "   Tried: SRCROOT=${SRCROOT}"
    echo "   Current directory: $(pwd)"
    exit 1
fi

echo "📁 Repository root: ${REPO_ROOT}"
cd "${REPO_ROOT}"

# Verify we're in the right place
echo "📂 Current directory contents:"
ls -la | head -20

# Check if Node.js is available
if ! command -v node &> /dev/null; then
  echo "❌ Error: Node.js not found. Xcode Cloud should have Node.js installed."
  exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
  echo "❌ Error: npm not found. Xcode Cloud should have npm installed."
  exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install dependencies
echo "📦 Installing npm dependencies..."
echo "Using npm ci for clean, reproducible installs..."

# Try npm ci first, fall back to npm install if package-lock.json is missing
if [ -f "package-lock.json" ]; then
  npm ci --prefer-offline --no-audit || {
    echo "⚠️  npm ci failed, trying npm install..."
    npm install --prefer-offline --no-audit
  }
else
  echo "⚠️  package-lock.json not found, using npm install..."
  npm install --prefer-offline --no-audit
fi

if [ $? -ne 0 ]; then
  echo "❌ Error: npm install failed"
  echo "Debug info:"
  echo "  Node version: $(node --version)"
  echo "  npm version: $(npm --version)"
  echo "  Current dir: $(pwd)"
  echo "  package.json exists: $([ -f package.json ] && echo 'yes' || echo 'no')"
  exit 1
fi

echo "✅ npm install completed successfully"

# Verify Capacitor packages are installed
echo "🔍 Verifying Capacitor packages..."

REQUIRED_PACKAGES=(
  "@capacitor/app"
  "@capacitor/push-notifications"
  "@capacitor/splash-screen"
  "@capacitor/status-bar"
  "@capacitor/core"
  "@capacitor/ios"
)

MISSING_PACKAGES=()
for package in "${REQUIRED_PACKAGES[@]}"; do
  if [ ! -d "node_modules/$package" ]; then
    MISSING_PACKAGES+=("$package")
    echo "❌ Missing: $package"
  else
    echo "✅ Found: $package"
  fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
  echo "❌ Error: Missing required Capacitor packages"
  echo "Attempting to install missing packages..."
  npm install "${MISSING_PACKAGES[@]}"
  
  if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install missing packages"
    exit 1
  fi
fi

# Sync Capacitor (optional, but recommended)
echo "🔄 Syncing Capacitor..."
if command -v npx &> /dev/null; then
  npx cap sync ios || echo "⚠️  Warning: Capacitor sync failed, but continuing..."
else
  echo "⚠️  Warning: npx not found, skipping Capacitor sync"
fi

# Verify node_modules structure
echo "📂 Verifying node_modules structure..."
if [ ! -d "node_modules/@capacitor" ]; then
  echo "❌ Error: node_modules/@capacitor directory not found"
  echo "Debug: Listing node_modules contents:"
  ls -la node_modules/ 2>/dev/null | head -20 || echo "node_modules directory doesn't exist!"
  exit 1
fi

# List all Capacitor packages to verify
echo "📦 Installed Capacitor packages:"
ls -la node_modules/@capacitor/ || echo "⚠️  Could not list Capacitor packages"

# Verify each required package exists and is accessible
echo "🔍 Final verification of required packages..."
for package in "${REQUIRED_PACKAGES[@]}"; do
  PACKAGE_PATH="node_modules/$package"
  ABSOLUTE_PATH="$(cd "$(dirname "$PACKAGE_PATH")" 2>/dev/null && pwd)/$(basename "$PACKAGE_PATH")" || ABSOLUTE_PATH=""
  
  if [ -d "$PACKAGE_PATH" ]; then
    echo "✅ $package exists at: $PACKAGE_PATH"
    if [ -n "$ABSOLUTE_PATH" ]; then
      echo "   Absolute path: $ABSOLUTE_PATH"
    fi
    # Verify it's readable
    if [ -r "$PACKAGE_PATH" ]; then
      echo "   ✓ Package is readable"
      # Check if Package.swift can access it
      PACKAGE_SWIFT_PATH="ios/App/CapApp-SPM/Package.swift"
      if [ -f "$PACKAGE_SWIFT_PATH" ]; then
        # Verify the relative path from Package.swift location
        RELATIVE_FROM_PACKAGE_SWIFT="../../../node_modules/$package"
        PACKAGE_SWIFT_DIR="$(dirname "$PACKAGE_SWIFT_PATH")"
        EXPECTED_PATH="$PACKAGE_SWIFT_DIR/$RELATIVE_FROM_PACKAGE_SWIFT"
        EXPECTED_ABSOLUTE="$(cd "$(dirname "$EXPECTED_PATH")" 2>/dev/null && pwd)/$(basename "$EXPECTED_PATH")" || EXPECTED_ABSOLUTE=""
        
        if [ -d "$EXPECTED_PATH" ] || [ -d "$EXPECTED_ABSOLUTE" ]; then
          echo "   ✓ Package.swift can access via relative path"
        else
          echo "   ⚠️  Warning: Package.swift relative path might not resolve correctly"
          echo "      Expected from Package.swift: $EXPECTED_PATH"
          if [ -n "$ABSOLUTE_PATH" ]; then
            echo "      Actual location: $ABSOLUTE_PATH"
          fi
        fi
      fi
    else
      echo "   ❌ Package is NOT readable!"
    fi
  else
    echo "❌ $package MISSING at: $PACKAGE_PATH"
    echo "   Current directory: $(pwd)"
    echo "   Listing node_modules:"
    ls -la node_modules/ 2>/dev/null | head -10 || echo "   node_modules doesn't exist!"
    exit 1
  fi
done

# Create a marker file to verify script ran
echo "📝 Creating verification marker..."
echo "Pre-build script completed at $(date)" > .xcodecloud_prebuild_complete
echo "Node modules installed: $(ls -d node_modules/@capacitor/* 2>/dev/null | wc -l) packages"

echo "✅ All dependencies installed successfully!"
echo "✅ Pre-build setup complete!"
echo "=========================================="
