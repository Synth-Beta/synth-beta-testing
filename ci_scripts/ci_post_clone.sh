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

# Ensure Node.js is available — check common paths, then fall back to nodejs.org direct download.
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
    echo "❌ Error: Could not download Node.js from nodejs.org"
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

# Check for required environment variables
echo "🔍 Checking environment variables..."
if [ -z "$VITE_SUPABASE_URL" ]; then
  echo "⚠️  WARNING: VITE_SUPABASE_URL not set!"
  echo "   Supabase authentication will not work in the app"
  echo "   Set this in Xcode Cloud workflow → Environment Variables"
fi
if [ -z "$VITE_SUPABASE_ANON_KEY" ] && [ -z "$VITE_SUPABASE_PUBLISHABLE_KEY" ]; then
  echo "⚠️  WARNING: VITE_SUPABASE_ANON_KEY not set!"
  echo "   Supabase authentication will not work in the app"
  echo "   Set this in Xcode Cloud workflow → Environment Variables"
fi

# Log which variables are set (without exposing values)
echo "Environment variables status:"
echo "  VITE_SUPABASE_URL: $([ -n "$VITE_SUPABASE_URL" ] && echo 'SET' || echo 'MISSING')"
echo "  VITE_SUPABASE_ANON_KEY: $([ -n "$VITE_SUPABASE_ANON_KEY" ] && echo 'SET' || echo 'MISSING')"
echo "  VITE_SUPABASE_PUBLISHABLE_KEY: $([ -n "$VITE_SUPABASE_PUBLISHABLE_KEY" ] && echo 'SET' || echo 'MISSING')"

# Build with environment variables
echo "Running: npm run build"
if ! npm run build; then
  echo "❌ Error: npm run build failed"
  echo "   This means the latest code changes were not built into dist/"
  echo "   The iOS app will be built with outdated web assets"
  if [ -z "$VITE_SUPABASE_URL" ] || ([ -z "$VITE_SUPABASE_ANON_KEY" ] && [ -z "$VITE_SUPABASE_PUBLISHABLE_KEY" ]); then
    echo ""
    echo "⚠️  CRITICAL: Supabase environment variables are missing!"
    echo "   Go to Xcode Cloud workflow settings and add:"
    echo "   - VITE_SUPABASE_URL"
    echo "   - VITE_SUPABASE_ANON_KEY"
  fi
  exit 1
fi

# Verify dist directory was created
if [ ! -d "dist" ]; then
  echo "❌ Error: dist directory not created after npm run build"
  exit 1
fi

echo "✅ dist directory created with $(ls dist | wc -l | tr -d ' ') items"

# Run Capacitor sync (copies dist/ to ios/App/App/public/)
echo "🔄 Running Capacitor sync..."
if ! npx cap sync ios; then
  echo "❌ Error: npx cap sync ios failed"
  echo "   This means dist/ files were not copied to ios/App/App/public/"
  echo "   The iOS app will be built with outdated web assets"
  exit 1
fi

# Verify sync worked - check that public directory has files
if [ ! -f "ios/App/App/public/index.html" ]; then
  echo "❌ Error: ios/App/App/public/index.html not found after cap sync"
  echo "   The sync may have failed silently"
  exit 1
fi

echo "✅ Capacitor sync completed - latest files are in ios/App/App/public/"

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
