#!/bin/bash

# Script to add a Run Script build phase to Xcode project
# This ensures npm dependencies are installed before SPM resolves packages
#
# Usage: Run this script to add the build phase (or add it manually in Xcode)

echo "This script would add a build phase to the Xcode project."
echo ""
echo "To add the build phase manually in Xcode:"
echo ""
echo "1. Open ios/App/App.xcodeproj in Xcode"
echo "2. Select the 'App' target"
echo "3. Go to 'Build Phases' tab"
echo "4. Click '+' → 'New Run Script Phase'"
echo "5. Drag it to be FIRST (before all other phases)"
echo "6. Name it: 'Install Dependencies Before Package Resolution'"
echo "7. Add this script:"
echo ""
cat << 'SCRIPT'
#!/bin/bash
set -e

# Get project root (3 levels up from SRCROOT)
PROJECT_ROOT="${SRCROOT}/../../.."

echo "📦 Checking npm dependencies..."

# Only run if node_modules doesn't exist
if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
  echo "📦 Installing npm dependencies (required for SPM resolution)..."
  cd "${PROJECT_ROOT}"
  
  # Check if package.json exists
  if [ -f "package.json" ]; then
    if [ -f "package-lock.json" ]; then
      npm ci --prefer-offline --no-audit
    else
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
  fi
else
  echo "✅ node_modules already exists"
fi
SCRIPT

echo ""
echo "8. Set Shell to: /bin/bash"
echo "9. Set 'Based on dependency analysis' to: NO"
echo "10. Set 'For install builds only' to: NO"
echo ""
echo "This ensures dependencies are installed before Swift Package Manager"
echo "tries to resolve the local package paths in Package.swift."
