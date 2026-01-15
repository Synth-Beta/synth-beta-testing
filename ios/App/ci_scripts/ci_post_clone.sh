#!/bin/bash

# Xcode Cloud Post-Clone Script
# This script runs IMMEDIATELY after the repository is cloned, BEFORE Swift Package Manager
# tries to resolve dependencies. This is critical for Capacitor apps where npm packages
# need to exist before SPM can resolve the local package paths.

# Enable verbose output for debugging
set -x

echo "🚀 Starting post-clone setup..."
echo "=========================================="

# In Xcode Cloud, the repository is always at /Volumes/workspace/repository
# This is the most reliable path to use
PROJECT_ROOT="/Volumes/workspace/repository"

# Fallback: try environment variables if the standard path doesn't work
if [ ! -f "${PROJECT_ROOT}/package.json" ]; then
  echo "⚠️  Standard Xcode Cloud path doesn't have package.json, trying alternatives..."
  
  # Try CI_PRIMARY_REPOSITORY_PATH
  if [ -n "$CI_PRIMARY_REPOSITORY_PATH" ] && [ -f "${CI_PRIMARY_REPOSITORY_PATH}/package.json" ]; then
    PROJECT_ROOT="$CI_PRIMARY_REPOSITORY_PATH"
  # Try CI_WORKSPACE
  elif [ -n "$CI_WORKSPACE" ] && [ -f "${CI_WORKSPACE}/package.json" ]; then
    PROJECT_ROOT="$CI_WORKSPACE"
  # Try script location
  else
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    POTENTIAL_ROOT="$( cd "$SCRIPT_DIR/../../.." 2>/dev/null && pwd )"
    if [ -f "${POTENTIAL_ROOT}/package.json" ]; then
      PROJECT_ROOT="$POTENTIAL_ROOT"
    fi
  fi
fi

echo "📁 Project root: $PROJECT_ROOT"
echo "📁 CI_PRIMARY_REPOSITORY_PATH: ${CI_PRIMARY_REPOSITORY_PATH:-not set}"
echo "📁 CI_WORKSPACE: ${CI_WORKSPACE:-not set}"

# Navigate to project root
cd "$PROJECT_ROOT" || {
  echo "❌ Error: Could not cd to $PROJECT_ROOT"
  exit 1
}

echo "📂 Current directory: $(pwd)"
echo "📂 Directory contents:"
ls -la | head -15

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found!"
  echo "   Searched in: $PROJECT_ROOT"
  echo "   Available files:"
  ls -la
  exit 1
fi

echo "✅ Found package.json"

# Install Node.js using Homebrew if not available
if ! command -v node &> /dev/null; then
  echo "📦 Node.js not found, installing via Homebrew..."
  
  # Xcode Cloud has Homebrew pre-installed
  if command -v brew &> /dev/null; then
    brew install node
  else
    echo "❌ Error: Neither Node.js nor Homebrew available"
    exit 1
  fi
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Clean any partial node_modules that might exist
if [ -d "node_modules" ]; then
  echo "🧹 Removing existing node_modules to ensure clean install..."
  rm -rf node_modules
fi

# Install dependencies
echo "📦 Installing npm dependencies..."

if [ -f "package-lock.json" ]; then
  echo "   Using npm ci (clean install)..."
  npm ci --no-audit --no-fund
  NPM_EXIT=$?
else
  echo "   Using npm install..."
  npm install --no-audit --no-fund
  NPM_EXIT=$?
fi

if [ $NPM_EXIT -ne 0 ]; then
  echo "❌ npm install failed with exit code: $NPM_EXIT"
  echo "   Trying npm install with legacy peer deps..."
  npm install --no-audit --no-fund --legacy-peer-deps
  NPM_EXIT=$?
fi

if [ $NPM_EXIT -ne 0 ]; then
  echo "❌ npm install failed again. Debug info:"
  echo "   Node: $(node --version)"
  echo "   npm: $(npm --version)"
  exit 1
fi

echo "✅ npm install completed"

# Verify node_modules exists
if [ ! -d "node_modules" ]; then
  echo "❌ Error: node_modules directory not created!"
  exit 1
fi

echo "📦 node_modules created with $(ls node_modules | wc -l | tr -d ' ') packages"

# Verify Capacitor packages exist
echo "🔍 Verifying Capacitor packages..."

CAPACITOR_PACKAGES=(
  "@capacitor/app"
  "@capacitor/push-notifications"
  "@capacitor/splash-screen"
  "@capacitor/status-bar"
  "@capacitor/core"
  "@capacitor/ios"
)

MISSING=()
for pkg in "${CAPACITOR_PACKAGES[@]}"; do
  if [ -d "node_modules/$pkg" ]; then
    echo "   ✅ $pkg"
  else
    echo "   ❌ $pkg MISSING"
    MISSING+=("$pkg")
  fi
done

# If any packages are missing, try to install them explicitly
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️  Some Capacitor packages missing, installing explicitly..."
  npm install @capacitor/core@^8.0.0 @capacitor/app@^8.0.0 @capacitor/push-notifications@^8.0.0 @capacitor/splash-screen@^8.0.0 @capacitor/status-bar@^8.0.0 @capacitor/ios@^8.0.0 --no-audit --no-fund
  
  # Verify again
  for pkg in "${MISSING[@]}"; do
    if [ ! -d "node_modules/$pkg" ]; then
      echo "❌ Failed to install: $pkg"
      echo "   Listing @capacitor packages:"
      ls -la node_modules/@capacitor/ 2>/dev/null || echo "   @capacitor folder doesn't exist"
      exit 1
    fi
  done
fi

# List installed Capacitor packages for debugging
echo "📦 Installed @capacitor packages:"
ls -la node_modules/@capacitor/

# Verify the paths that Package.swift will use
echo "🔍 Verifying SPM paths..."
SPM_PACKAGES_DIR="$PROJECT_ROOT/node_modules/@capacitor"

for pkg in app push-notifications splash-screen status-bar; do
  FULL_PATH="$SPM_PACKAGES_DIR/$pkg"
  if [ -d "$FULL_PATH" ]; then
    echo "   ✅ $FULL_PATH exists"
  else
    echo "   ❌ $FULL_PATH MISSING"
    exit 1
  fi
done

# Build web assets (required for cap sync to copy to ios/App/App/public)
echo "🔨 Building web assets..."
npm run build 2>&1 || {
  echo "⚠️  npm run build failed, but continuing..."
}

# Verify dist directory was created
if [ -d "dist" ]; then
  echo "✅ dist directory created with $(ls dist | wc -l | tr -d ' ') items"
else
  echo "⚠️  dist directory not created, cap sync may fail"
fi

# Run Capacitor sync (copies dist/ to ios/App/App/public/)
echo "🔄 Running Capacitor sync..."
npx cap sync ios 2>&1 || {
  echo "⚠️  cap sync failed, but continuing (might be already synced)"
}

echo "=========================================="
echo "✅ Post-clone setup complete!"
echo "✅ node_modules ready at: $PROJECT_ROOT/node_modules"
echo "✅ Capacitor packages verified"
echo "=========================================="

# Final verification
echo ""
echo "📋 Final state:"
echo "   PWD: $(pwd)"
echo "   node_modules exists: $([ -d node_modules ] && echo 'YES' || echo 'NO')"
echo "   @capacitor exists: $([ -d node_modules/@capacitor ] && echo 'YES' || echo 'NO')"
echo "   Package count: $(ls node_modules/@capacitor 2>/dev/null | wc -l | tr -d ' ')"

exit 0
