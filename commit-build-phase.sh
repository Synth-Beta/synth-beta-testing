#!/bin/bash
# Script to commit build phase changes

echo "📦 Committing build phase script changes..."

# Add the modified project file
if git diff --quiet ios/App/App.xcodeproj/project.pbxproj; then
  echo "⚠️  Warning: project.pbxproj has no changes"
  echo "   Make sure you've saved the project in Xcode first!"
else
  git add ios/App/App.xcodeproj/project.pbxproj
  echo "✅ Added project.pbxproj"
fi

# Add documentation if it exists
if [ -f "docs/build-phases.md" ]; then
  git add docs/build-phases.md
  echo "✅ Added docs/build-phases.md"
fi

# Add ci_pre_xcodebuild.sh if modified
if ! git diff --quiet ci_scripts/ci_pre_xcodebuild.sh 2>/dev/null; then
  git add ci_scripts/ci_pre_xcodebuild.sh
  echo "✅ Added ci_scripts/ci_pre_xcodebuild.sh"
fi

# Check what's staged
echo ""
echo "📋 Staged changes:"
git diff --cached --name-only

# Commit
echo ""
read -p "Commit these changes? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git commit -m "chore(build): add Run Script phase to install npm deps before SPM resolution

- Add Run Script build phase 'Install Dependencies Before Package Resolution' as first phase
- Ensures node_modules exists before Swift Package Manager resolves Capacitor packages
- Update ci_pre_xcodebuild.sh with improved path resolution
- Add build-phases.md documentation"
  
  echo ""
  echo "✅ Committed! Now push with:"
  echo "   git push origin main"
  echo "   git push origin develop  # if you use develop branch"
else
  echo "❌ Commit cancelled"
fi
