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

# --- Ensure Node.js is available (Xcode Cloud does not pre-install Node) ---
set_node_path() {
  export PATH="$1/bin:$PATH"
  if command -v node &> /dev/null; then
    return 0
  fi
  return 1
}

# 1) Already in PATH or common locations
if command -v node &> /dev/null; then
  echo "📦 Node.js found in PATH"
elif [ -x "/usr/local/bin/node" ]; then
  set_node_path "/usr/local"
  echo "📦 Node.js found at /usr/local"
elif [ -x "/opt/homebrew/bin/node" ]; then
  set_node_path "/opt/homebrew"
  echo "📦 Node.js found at /opt/homebrew"
fi

# 2) Install via Homebrew without auto-update (avoids ghcr.io fetch in restricted CI)
if ! command -v node &> /dev/null && command -v brew &> /dev/null; then
  echo "📦 Installing Node.js via Homebrew (no auto-update)..."
  export HOMEBREW_NO_AUTO_UPDATE=1
  export HOMEBREW_NO_INSTALL_FROM_API=1
  export HOMEBREW_NO_ENV_HINTS=1
  if brew install node 2>/dev/null; then
    BREW_PREFIX=$(brew --prefix 2>/dev/null || echo "/usr/local")
    set_node_path "$BREW_PREFIX"
  fi
fi

# 3) Fallback: download Node LTS from nodejs.org (works when Homebrew is blocked e.g. ghcr.io)
if ! command -v node &> /dev/null; then
  echo "📦 Node.js not available via Homebrew, trying direct download from nodejs.org..."
  NODE_VERSION="20.18.0"
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    NODE_ARCH="arm64"
  else
    NODE_ARCH="x64"
  fi
  TARBALL="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
  NODE_DIR="$PROJECT_ROOT/.ci-node"
  mkdir -p "$NODE_DIR"
  if curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}" -o "$NODE_DIR/${TARBALL}" 2>/dev/null; then
    tar -xzf "$NODE_DIR/${TARBALL}" -C "$NODE_DIR"
    set_node_path "$NODE_DIR/node-v${NODE_VERSION}-darwin-${NODE_ARCH}"
    echo "📦 Node.js installed from nodejs.org to $NODE_DIR"
  else
    echo "❌ Could not download Node from nodejs.org (network may be restricted)"
  fi
  rm -rf "$NODE_DIR/${TARBALL}" 2>/dev/null
fi

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is required but could not be installed."
  echo "   Xcode Cloud may restrict network (e.g. ghcr.io). Ensure nodejs.org is allowed or use a custom image with Node pre-installed."
  exit 1
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

# Check for required environment variables — FAIL HARD if missing
echo "🔍 Checking required environment variables..."
MISSING_VARS=()
if [ -z "$VITE_SUPABASE_URL" ]; then
  echo "❌ VITE_SUPABASE_URL is not set!"
  MISSING_VARS+=("VITE_SUPABASE_URL")
fi
if [ -z "$VITE_SUPABASE_ANON_KEY" ] && [ -z "$VITE_SUPABASE_PUBLISHABLE_KEY" ]; then
  echo "❌ Neither VITE_SUPABASE_ANON_KEY nor VITE_SUPABASE_PUBLISHABLE_KEY is set!"
  MISSING_VARS+=("VITE_SUPABASE_ANON_KEY")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo ""
  echo "❌ CRITICAL: Required environment variables are missing!"
  echo "   Missing: ${MISSING_VARS[*]}"
  echo ""
  echo "   To fix this:"
  echo "   1. Open Xcode Cloud → your workflow → Environment Variables"
  echo "   2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  echo "   3. Re-run the workflow"
  echo ""
  echo "   Without these, the app will bundle placeholder credentials"
  echo "   and all login attempts will fail with an API key error."
  exit 1
fi

echo "✅ VITE_SUPABASE_URL: SET"
echo "✅ VITE_SUPABASE_ANON_KEY/PUBLISHABLE_KEY: SET"

if ! npm run build; then
  echo "❌ Error: npm run build failed"
  echo "   Check the build output above for TypeScript/lint errors."
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
  echo "   dist/ files were not copied to ios/App/App/public/"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Inject Supabase credentials into Info.plist for the NATIVE Swift layer.
#
# WHY THIS IS NEEDED:
#   The app has a native Swift auth flow (AuthView.swift → SupabaseService.swift)
#   that reads credentials from Info.plist at runtime via Bundle.main. The plist
#   uses $(SUPABASE_ANON_KEY) — an Xcode build variable — which only resolves in
#   Debug builds via debug.xcconfig. For App Store (Release) builds there is no
#   release xcconfig, so the variable expands to empty string and the native
#   Supabase client falls back to its placeholder → API key error on login.
#
#   Xcode Cloud environment variables are NOT automatic Xcode build settings, so
#   setting VITE_SUPABASE_ANON_KEY in the workflow does not fix this on its own.
#   PlistBuddy writes the real values BEFORE xcodebuild runs, so Xcode uses the
#   literal string values rather than attempting build variable expansion.
# ─────────────────────────────────────────────────────────────────────────────
PLIST_PATH="$PROJECT_ROOT/ios/App/App/Info.plist"

# Resolve the anon key: prefer VITE_SUPABASE_ANON_KEY, fall back to VITE_SUPABASE_PUBLISHABLE_KEY
RESOLVED_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-$VITE_SUPABASE_PUBLISHABLE_KEY}"

if [ -f "$PLIST_PATH" ]; then
  echo "🔑 Injecting Supabase credentials into Info.plist for native Swift layer..."

  if [ -n "$VITE_SUPABASE_URL" ]; then
    /usr/libexec/PlistBuddy -c "Set :SUPABASE_URL $VITE_SUPABASE_URL" "$PLIST_PATH" 2>/dev/null \
      || /usr/libexec/PlistBuddy -c "Add :SUPABASE_URL string $VITE_SUPABASE_URL" "$PLIST_PATH"
    echo "   ✅ SUPABASE_URL written to Info.plist"
  else
    echo "   ⚠️  VITE_SUPABASE_URL not set — SUPABASE_URL left unchanged in Info.plist"
  fi

  if [ -n "$RESOLVED_ANON_KEY" ]; then
    /usr/libexec/PlistBuddy -c "Set :SUPABASE_ANON_KEY $RESOLVED_ANON_KEY" "$PLIST_PATH" 2>/dev/null \
      || /usr/libexec/PlistBuddy -c "Add :SUPABASE_ANON_KEY string $RESOLVED_ANON_KEY" "$PLIST_PATH"
    echo "   ✅ SUPABASE_ANON_KEY written to Info.plist"
  else
    echo "   ⚠️  No anon key env var found — SUPABASE_ANON_KEY left unchanged in Info.plist"
  fi
else
  echo "⚠️  Info.plist not found at $PLIST_PATH — skipping native credential injection"
fi

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
