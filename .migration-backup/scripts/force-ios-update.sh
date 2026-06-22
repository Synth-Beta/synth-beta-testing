#!/usr/bin/env bash
# Force a clean web build and sync to iOS so Xcode picks up the latest bundle.
# Run this after making frontend changes, then in Xcode: Product > Clean Build Folder (Shift+Cmd+K), then Build & Run.

set -e
cd "$(dirname "$0")/.."

echo "🧹 Removing old build..."
rm -rf dist

echo "📦 Building web app (fresh)..."
npm run build

echo "📲 Syncing to iOS..."
npx cap sync ios

# Touch index.html so Xcode sees the file changed and re-copies into the app bundle
if [ -f "ios/App/App/public/index.html" ]; then
  touch "ios/App/App/public/index.html"
  echo "✅ Touched ios/App/App/public/index.html"
fi

echo ""
echo "✅ Done. Each build injects a unique timestamp into index.html (meta name=synth-build)."
echo ""
echo "📱 In Xcode:"
echo "   1. Product > Clean Build Folder (Shift+Cmd+K)"
echo "   2. Product > Build (Cmd+B)"
echo "   3. Run on device/simulator"
echo ""
