#!/bin/bash
# Build Phase Script: Install Dependencies Before SPM Resolution
# This script ensures npm dependencies are installed before Swift Package Manager
# tries to resolve the local package paths in Package.swift.

# Don't use set -e here - we want to handle errors gracefully
set +e

# Get project root (3 levels up from SRCROOT)
# SRCROOT is typically: ios/App/App
# Going up 3 levels: ios/App/App -> ios/App -> ios -> root
PROJECT_ROOT="${SRCROOT}/../../.."

echo "📦 [Build Phase] Checking npm dependencies..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
  echo "⚠️  [Build Phase] Warning: Node.js not found in PATH"
  echo "   This is normal if dependencies were already installed by ci_post_clone.sh"
  echo "   Continuing build..."
  exit 0
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
  echo "⚠️  [Build Phase] Warning: npm not found in PATH"
  echo "   This is normal if dependencies were already installed by ci_post_clone.sh"
  echo "   Continuing build..."
  exit 0
fi

echo "✅ [Build Phase] Node.js: $(node --version)"
echo "✅ [Build Phase] npm: $(npm --version)"

# Verify we're in the right place
if [ ! -f "${PROJECT_ROOT}/package.json" ]; then
  echo "⚠️  [Build Phase] Warning: package.json not found at ${PROJECT_ROOT}"
  echo "   Expected path: ${PROJECT_ROOT}/package.json"
  echo "   Current SRCROOT: ${SRCROOT}"
  echo "   This might be okay if dependencies were installed by ci_post_clone.sh"
  exit 0
fi

# Only run if node_modules doesn't exist
if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
  echo "📦 [Build Phase] Installing npm dependencies (required for SPM resolution)..."
  cd "${PROJECT_ROOT}" || {
    echo "❌ [Build Phase] Error: Could not cd to ${PROJECT_ROOT}"
    exit 1
  }
  
  # Install dependencies
  if [ -f "package-lock.json" ]; then
    echo "   Using npm ci..."
    npm ci --prefer-offline --no-audit
    INSTALL_EXIT=$?
  else
    echo "   Using npm install..."
    npm install --no-audit
    INSTALL_EXIT=$?
  fi
  
  if [ $INSTALL_EXIT -ne 0 ]; then
    echo "❌ [Build Phase] Error: npm install failed (exit code: $INSTALL_EXIT)"
    echo "   This might cause SPM resolution to fail"
    exit 1
  fi
  
  # Verify all required Capacitor packages exist
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
    fi
  done
  
  if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo "❌ [Build Phase] Error: Missing required Capacitor packages:"
    for package in "${MISSING_PACKAGES[@]}"; do
      echo "   - $package"
    done
    exit 1
  fi
  
  echo "✅ [Build Phase] npm dependencies installed successfully"
  echo "✅ [Build Phase] All Capacitor packages verified"
else
  echo "✅ [Build Phase] node_modules already exists"
  
  # Still verify Capacitor packages exist (safety check)
  REQUIRED_PACKAGES=(
    "@capacitor/app"
    "@capacitor/push-notifications"
    "@capacitor/splash-screen"
    "@capacitor/status-bar"
  )
  
  MISSING_PACKAGES=()
  for package in "${REQUIRED_PACKAGES[@]}"; do
    if [ ! -d "${PROJECT_ROOT}/node_modules/$package" ]; then
      MISSING_PACKAGES+=("$package")
    fi
  done
  
  if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo "⚠️  [Build Phase] Warning: Some Capacitor packages are missing:"
    for package in "${MISSING_PACKAGES[@]}"; do
      echo "   - $package"
    done
    echo "   This might cause SPM resolution to fail"
    # Don't exit - let the build continue and see if SPM can handle it
  else
    echo "✅ [Build Phase] All required Capacitor packages verified"
  fi
fi

echo "✅ [Build Phase] Dependency check complete"
exit 0
