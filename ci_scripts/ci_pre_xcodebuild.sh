#!/bin/sh

# Xcode Cloud Pre-Build Script
# This script runs before Xcode resolves package dependencies
# It ensures npm dependencies are installed so Swift Package Manager can find Capacitor packages

set -e

echo "🔧 Xcode Cloud Pre-Build: Installing npm dependencies..."

# Navigate to repository root
# In Xcode Cloud, the workspace is at /Volumes/workspace/repository
# Try multiple paths to find the repository root
REPO_ROOT=""

# Try Xcode Cloud environment variables first
if [ -n "${CI_WORKSPACE}" ] && [ -f "${CI_WORKSPACE}/package.json" ]; then
    REPO_ROOT="${CI_WORKSPACE}"
elif [ -n "${CI_PRIMARY_REPOSITORY_PATH}" ] && [ -f "${CI_PRIMARY_REPOSITORY_PATH}/package.json" ]; then
    REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH}"
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
    echo "   Tried: SRCROOT=${SRCROOT}"
    echo "   Current directory: $(pwd)"
    exit 1
fi

echo "📁 Repository root: ${REPO_ROOT}"
cd "${REPO_ROOT}"

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed or not in PATH"
    exit 1
fi

echo "📦 Node version: $(node --version)"
echo "📦 npm version: $(npm --version)"
echo "📦 Current directory: $(pwd)"

# Install npm dependencies
echo "📥 Installing npm dependencies..."
npm ci --prefer-offline --no-audit || npm install --prefer-offline --no-audit

# Verify Capacitor packages are installed
echo "✅ Verifying Capacitor packages..."
if [ ! -d "node_modules/@capacitor/app" ]; then
    echo "❌ Error: @capacitor/app not found after installation"
    exit 1
fi

if [ ! -d "node_modules/@capacitor/push-notifications" ]; then
    echo "❌ Error: @capacitor/push-notifications not found after installation"
    exit 1
fi

if [ ! -d "node_modules/@capacitor/splash-screen" ]; then
    echo "❌ Error: @capacitor/splash-screen not found after installation"
    exit 1
fi

if [ ! -d "node_modules/@capacitor/status-bar" ]; then
    echo "❌ Error: @capacitor/status-bar not found after installation"
    exit 1
fi

echo "✅ All Capacitor packages verified successfully!"
echo "✅ npm dependencies installed. Ready for Xcode build."

