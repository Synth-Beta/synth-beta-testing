#!/bin/bash

# Xcode Cloud Post-Clone Script
# This script runs IMMEDIATELY after the repository is cloned, BEFORE Swift Package Manager
# tries to resolve dependencies. This is critical for Capacitor apps where npm packages
# need to exist before SPM can resolve the local package paths.
#
# Execution order in Xcode Cloud:
# 1. Repository cloned
# 2. ci_post_clone.sh runs (THIS SCRIPT) ← Install npm dependencies here
# 3. Swift Package Manager resolves dependencies ← Needs node_modules to exist
# 4. ci_pre_xcodebuild.sh runs
# 5. xcodebuild runs

# Don't use set -e initially, we want to see all errors
# set -e  # Exit on error

# Enable verbose output for debugging
set -x

# Exit on error for critical commands
set -o pipefail

echo "🚀 Starting post-clone setup (BEFORE SPM dependency resolution)..."
echo "=========================================="
echo "Environment Variables:"
echo "CI_WORKSPACE: ${CI_WORKSPACE:-not set}"
echo "CI_PROJECT_DIR: ${CI_PROJECT_DIR:-not set}"
echo "PWD: $(pwd)"
echo "=========================================="

# Get the project root directory
PROJECT_ROOT="${CI_WORKSPACE:-${CI_PROJECT_DIR:-$(pwd)}}"

echo "📁 Project root: $PROJECT_ROOT"

# Navigate to project root
cd "$PROJECT_ROOT"

# Verify we're in the right place
echo "📂 Current directory contents:"
ls -la | head -20

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found at $PROJECT_ROOT"
  exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
  echo "❌ Error: Node.js not found. Xcode Cloud should have Node.js installed."
  exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install dependencies
echo "📦 Installing npm dependencies (CRITICAL: Must happen before SPM resolves dependencies)..."
echo "Using npm ci for clean, reproducible installs..."

# Ensure we're in the right directory
echo "📍 Verifying location before npm install:"
echo "   Current directory: $(pwd)"
echo "   Full path: $(pwd -P)"
echo "   package.json exists: $([ -f package.json ] && echo 'yes' || echo 'no')"

# Try npm ci first, fall back to npm install if package-lock.json is missing
INSTALL_SUCCESS=false
if [ -f "package-lock.json" ]; then
  echo "   package-lock.json found, using npm ci..."
  npm ci --prefer-offline --no-audit && INSTALL_SUCCESS=true || {
    echo "⚠️  npm ci failed (exit code: $?), trying npm install..."
    npm install --no-audit && INSTALL_SUCCESS=true || {
      echo "❌ npm install also failed (exit code: $?)"
      INSTALL_SUCCESS=false
    }
  }
else
  echo "⚠️  package-lock.json not found, using npm install..."
  npm install --no-audit && INSTALL_SUCCESS=true || {
    echo "❌ npm install failed (exit code: $?)"
    INSTALL_SUCCESS=false
  }
fi

if [ "$INSTALL_SUCCESS" = false ]; then
  echo "❌ Error: npm install failed"
  echo "Debug info:"
  echo "  Node version: $(node --version 2>&1)"
  echo "  npm version: $(npm --version 2>&1)"
  echo "  Current dir: $(pwd)"
  echo "  package.json exists: $([ -f package.json ] && echo 'yes' || echo 'no')"
  echo "  Listing current directory:"
  ls -la | head -10
  exit 1
fi

echo "✅ npm install completed successfully"
echo "📦 Verifying node_modules was created:"
if [ -d "node_modules" ]; then
  echo "   ✓ node_modules directory exists"
  echo "   Number of packages: $(ls -d node_modules/* 2>/dev/null | wc -l)"
else
  echo "   ❌ node_modules directory does NOT exist!"
  exit 1
fi

# Verify Capacitor packages are installed
echo "🔍 Verifying Capacitor packages (must exist before SPM resolves dependencies)..."

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
  ABSOLUTE_PATH="$(cd "$(dirname "$PACKAGE_PATH")" 2>/dev/null && pwd)/$(basename "$PACKAGE_PATH")" || ABSOLUTE_PATH="$PACKAGE_PATH"
  
  if [ -d "$PACKAGE_PATH" ]; then
    echo "✅ $package exists at: $PACKAGE_PATH"
    echo "   Absolute path: $ABSOLUTE_PATH"
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
          echo "      Actual location: $ABSOLUTE_PATH"
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
echo "Post-clone script completed at $(date)" > .xcodecloud_postclone_complete
echo "Node modules installed: $(ls -d node_modules/@capacitor/* 2>/dev/null | wc -l) packages"

echo "✅ All dependencies installed successfully!"
echo "✅ Post-clone setup complete!"
echo "✅ node_modules is now available for Swift Package Manager to resolve dependencies"
echo "=========================================="
