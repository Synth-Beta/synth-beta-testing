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
echo "CI_PRIMARY_REPOSITORY_PATH: ${CI_PRIMARY_REPOSITORY_PATH:-not set}"
echo "CI_WORKSPACE: ${CI_WORKSPACE:-not set}"
echo "CI_PROJECT_DIR: ${CI_PROJECT_DIR:-not set}"
echo "PWD: $(pwd)"
echo "=========================================="

# Get the project root directory
# In Xcode Cloud, CI_PRIMARY_REPOSITORY_PATH is the most reliable path
# Fallback to CI_WORKSPACE, CI_PROJECT_DIR, or current directory
PROJECT_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-${CI_WORKSPACE:-${CI_PROJECT_DIR:-$(pwd)}}}"

# If the path doesn't have package.json, try going up one level
if [ ! -f "${PROJECT_ROOT}/package.json" ]; then
  if [ -f "${PROJECT_ROOT}/../package.json" ]; then
    PROJECT_ROOT="${PROJECT_ROOT}/.."
  fi
fi

echo "📁 Project root: $PROJECT_ROOT"

# Navigate to project root
cd "$PROJECT_ROOT" || {
  echo "❌ Error: Could not cd to $PROJECT_ROOT"
  echo "   Current directory: $(pwd)"
  exit 1
}

# Verify we're in the right place
echo "📂 Current directory contents:"
ls -la | head -20

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found at $PROJECT_ROOT"
  exit 1
fi

# Ensure Node.js is available — check common paths, then fall back to nodejs.org.
# Homebrew is NOT used: ghcr.io (Homebrew bottle CDN) is blocked in Xcode Cloud.
if ! command -v node &> /dev/null; then
  for node_dir in /usr/local /opt/homebrew; do
    if [ -x "$node_dir/bin/node" ]; then
      export PATH="$node_dir/bin:$PATH"
      break
    fi
  done
fi

if ! command -v node &> /dev/null; then
  echo "📦 Node.js not in PATH, downloading from nodejs.org..."
  NODE_VERSION="20.18.0"
  ARCH=$(uname -m)
  NODE_ARCH="x64"; [ "$ARCH" = "arm64" ] && NODE_ARCH="arm64"
  TARBALL="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
  NODE_DIR="$PROJECT_ROOT/.ci-node"
  mkdir -p "$NODE_DIR"
  if curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}" -o "$NODE_DIR/${TARBALL}"; then
    tar -xzf "$NODE_DIR/${TARBALL}" -C "$NODE_DIR"
    export PATH="$NODE_DIR/node-v${NODE_VERSION}-darwin-${NODE_ARCH}/bin:$PATH"
    rm -f "$NODE_DIR/${TARBALL}"
  else
    echo "❌ Error: Node.js not found and nodejs.org download failed"
    exit 1
  fi
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
  if npm ci --prefer-offline --no-audit; then
    INSTALL_SUCCESS=true
  else
    EXIT_CODE=$?
    echo "⚠️  npm ci failed (exit code: $EXIT_CODE), trying npm install..."
    if npm install --no-audit; then
      INSTALL_SUCCESS=true
    else
      EXIT_CODE=$?
      echo "❌ npm install also failed (exit code: $EXIT_CODE)"
      INSTALL_SUCCESS=false
    fi
  fi
else
  echo "⚠️  package-lock.json not found, using npm install..."
  if npm install --no-audit; then
    INSTALL_SUCCESS=true
  else
    EXIT_CODE=$?
    echo "❌ npm install failed (exit code: $EXIT_CODE)"
    INSTALL_SUCCESS=false
  fi
fi

if [ "$INSTALL_SUCCESS" = false ]; then
  echo "❌ Error: npm install failed"
  echo "Debug info:"
  echo "  Node version: $(node --version 2>&1)"
  echo "  npm version: $(npm --version 2>&1)"
  echo "  Current dir: $(pwd)"
  echo "  package.json exists: $([ -f package.json ] && echo 'yes' || echo 'no')"
  echo "  package-lock.json exists: $([ -f package-lock.json ] && echo 'yes' || echo 'no')"
  echo "  Listing current directory:"
  ls -la | head -10
  echo "  Checking npm cache:"
  npm cache verify 2>&1 || echo "  npm cache verify failed"
  exit 1
fi

# Verify installation completed - check for critical packages immediately
echo "🔍 Verifying critical packages were installed..."
CRITICAL_MISSING=false
for package in "@capacitor/core" "@capacitor/app" "@capacitor/push-notifications"; do
  if [ ! -d "node_modules/$package" ]; then
    echo "❌ Critical package missing immediately after install: $package"
    CRITICAL_MISSING=true
  fi
done

if [ "$CRITICAL_MISSING" = true ]; then
  echo "❌ Error: Critical Capacitor packages missing after npm install"
  echo "Attempting to install Capacitor packages explicitly..."
  npm install @capacitor/core @capacitor/app @capacitor/push-notifications @capacitor/splash-screen @capacitor/status-bar @capacitor/ios --no-audit
  if [ $? -ne 0 ]; then
    echo "❌ Failed to install Capacitor packages explicitly"
    exit 1
  fi
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
        
        # Resolve the actual absolute path
        RESOLVED_PATH="$(cd "$PROJECT_ROOT" && cd "$(dirname "$PACKAGE_PATH")" 2>/dev/null && pwd)/$(basename "$PACKAGE_PATH")" || RESOLVED_PATH=""
        
        if [ -d "$EXPECTED_PATH" ] || [ -d "$EXPECTED_ABSOLUTE" ] || [ -d "$RESOLVED_PATH" ]; then
          echo "   ✓ Package.swift can access via relative path"
          # Verify the package has required files (Package.swift or similar)
          if [ -f "$PACKAGE_PATH/package.json" ] || [ -f "$PACKAGE_PATH/Package.swift" ] || [ -d "$PACKAGE_PATH/ios" ]; then
            echo "   ✓ Package has required structure"
          else
            echo "   ⚠️  Warning: Package structure might be incomplete"
            echo "      Listing package contents:"
            ls -la "$PACKAGE_PATH" 2>/dev/null | head -5 || echo "      Could not list package contents"
          fi
        else
          echo "   ❌ ERROR: Package.swift relative path does NOT resolve correctly!"
          echo "      Expected from Package.swift: $EXPECTED_PATH"
          echo "      Expected absolute: $EXPECTED_ABSOLUTE"
          echo "      Resolved path: $RESOLVED_PATH"
          echo "      Actual location: $ABSOLUTE_PATH"
          echo "      Current directory: $(pwd)"
          echo "      Project root: $PROJECT_ROOT"
          echo "      Verifying path resolution..."
          cd "$PACKAGE_SWIFT_DIR" && ls -la "$RELATIVE_FROM_PACKAGE_SWIFT" 2>&1 || echo "      Path resolution failed!"
          exit 1
        fi
      fi
    else
      echo "   ❌ Package is NOT readable!"
      echo "   Checking permissions..."
      ls -ld "$PACKAGE_PATH" 2>&1
      exit 1
    fi
  else
    echo "❌ $package MISSING at: $PACKAGE_PATH"
    echo "   Current directory: $(pwd)"
    echo "   Listing node_modules:"
    ls -la node_modules/ 2>/dev/null | head -10 || echo "   node_modules doesn't exist!"
    echo "   Listing @capacitor directory:"
    ls -la node_modules/@capacitor/ 2>/dev/null | head -10 || echo "   @capacitor directory doesn't exist!"
    exit 1
  fi
done

# Add a small delay to ensure file system is fully synced
echo "⏳ Waiting for file system to sync..."
sleep 2

# Final verification: Test that SPM can actually see the packages
echo "🔍 Testing Swift Package Manager path resolution..."
PACKAGE_SWIFT_DIR="$PROJECT_ROOT/ios/App/CapApp-SPM"
if [ -d "$PACKAGE_SWIFT_DIR" ]; then
  cd "$PACKAGE_SWIFT_DIR"
  for package in "${REQUIRED_PACKAGES[@]}"; do
    RELATIVE_PATH="../../../node_modules/$package"
    if [ -d "$RELATIVE_PATH" ]; then
      echo "   ✅ SPM can resolve: $package"
    else
      echo "   ❌ SPM CANNOT resolve: $package at $RELATIVE_PATH"
      echo "      Current directory: $(pwd)"
      echo "      Attempting to resolve..."
      ls -la "$RELATIVE_PATH" 2>&1 || echo "      Resolution failed!"
      exit 1
    fi
  done
  cd "$PROJECT_ROOT"
fi

# Sync Capacitor with iOS project
echo "🔄 Syncing Capacitor with iOS project..."
if command -v npx &> /dev/null; then
  cd "$PROJECT_ROOT"
  npx cap sync ios || {
    echo "⚠️  Warning: cap sync ios failed, but continuing..."
    echo "   This might be okay if Capacitor is already synced"
  }
else
  echo "⚠️  Warning: npx not found, skipping cap sync"
fi

# Create a marker file to verify script ran
echo "📝 Creating verification marker..."
echo "Post-clone script completed at $(date)" > .xcodecloud_postclone_complete
echo "Node modules installed: $(ls -d node_modules/@capacitor/* 2>/dev/null | wc -l) packages"

echo "✅ All dependencies installed successfully!"
echo "✅ Post-clone setup complete!"
echo "✅ node_modules is now available for Swift Package Manager to resolve dependencies"
echo "=========================================="

# Final verification - list what was installed
echo ""
echo "📋 Final verification - Capacitor packages:"
ls -la node_modules/@capacitor/ 2>/dev/null | grep "^d" | awk '{print $9}' || echo "⚠️  Could not list packages"

# Create a marker file that persists
echo "Post-clone script completed successfully at $(date)" > .xcodecloud_postclone_success
echo "Repository root: $(pwd)" >> .xcodecloud_postclone_success
echo "Node modules path: $(pwd)/node_modules" >> .xcodecloud_postclone_success
