#!/bin/bash

# Sync Admin Component to getsynth.app Repo
# This script copies the Admin component from this repo to the getsynth.app repo

# Configuration - UPDATE THIS PATH to point to your getsynth.app repo
GETSYNTH_REPO_PATH="../getsynth-app"  # Adjust this path as needed
ADMIN_FILE="src/pages/Admin.tsx"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔄 Syncing Admin component to getsynth.app..."
echo ""

# Check if source file exists
if [ ! -f "$REPO_ROOT/$ADMIN_FILE" ]; then
  echo -e "${RED}❌ Error: Admin component not found at $REPO_ROOT/$ADMIN_FILE${NC}"
  exit 1
fi

# Resolve getsynth.app repo path (can be relative or absolute)
if [[ "$GETSYNTH_REPO_PATH" == /* ]]; then
  # Absolute path
  GETSYNTH_REPO_FULL="$GETSYNTH_REPO_PATH"
else
  # Relative path
  GETSYNTH_REPO_FULL="$REPO_ROOT/$GETSYNTH_REPO_PATH"
fi

# Check if getsynth.app repo exists
if [ ! -d "$GETSYNTH_REPO_FULL" ]; then
  echo -e "${RED}❌ Error: getsynth.app repo not found at $GETSYNTH_REPO_FULL${NC}"
  echo ""
  echo "Please update GETSYNTH_REPO_PATH in this script:"
  echo "  $SCRIPT_DIR/$(basename "$0")"
  echo ""
  echo "Or create a symlink:"
  echo "  ln -s /path/to/getsynth-app $REPO_ROOT/getsynth-app"
  exit 1
fi

# Check if destination directory exists
GETSYNTH_ADMIN_DIR="$GETSYNTH_REPO_FULL/src/pages"
if [ ! -d "$GETSYNTH_ADMIN_DIR" ]; then
  echo -e "${YELLOW}⚠️  Creating directory: $GETSYNTH_ADMIN_DIR${NC}"
  mkdir -p "$GETSYNTH_ADMIN_DIR"
fi

# Copy Admin component
echo "📋 Copying $ADMIN_FILE..."
cp "$REPO_ROOT/$ADMIN_FILE" "$GETSYNTH_ADMIN_DIR/Admin.tsx"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Admin component synced successfully!${NC}"
  echo ""
  echo "📝 Next steps in getsynth.app repo:"
  echo "  1. cd $GETSYNTH_REPO_FULL"
  echo "  2. Review changes: git diff src/pages/Admin.tsx"
  echo "  3. Commit: git add src/pages/Admin.tsx && git commit -m 'Update admin component from main repo'"
  echo "  4. Deploy"
else
  echo -e "${RED}❌ Error copying file${NC}"
  exit 1
fi



