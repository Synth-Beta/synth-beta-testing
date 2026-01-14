#!/bin/bash

# Xcode Cloud Pre-Build Script
# This script runs before Xcode builds to ensure all dependencies are installed
#
# Xcode Cloud automatically runs scripts in ci_scripts/ directory:
# - ci_pre_xcodebuild.sh: Runs before xcodebuild
# - ci_post_xcodebuild.sh: Runs after xcodebuild (optional)

set -e  # Exit on error

echo "🚀 Starting pre-build setup..."

# Get the project root directory
# In Xcode Cloud, CI_WORKSPACE is set to the workspace path
# CI_PROJECT_DIR is set to the project directory
PROJECT_ROOT="${CI_WORKSPACE:-${CI_PROJECT_DIR:-$(pwd)}}"

echo "📁 Project root: $PROJECT_ROOT"

# Navigate to project root
cd "$PROJECT_ROOT"

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
echo "📦 Installing npm dependencies..."
npm ci --prefer-offline --no-audit

if [ $? -ne 0 ]; then
  echo "❌ Error: npm install failed"
  exit 1
fi

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
  exit 1
fi

echo "✅ All dependencies installed successfully!"
echo "✅ Pre-build setup complete!"
