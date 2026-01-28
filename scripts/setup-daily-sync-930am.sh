#!/bin/bash
# Setup Daily Sync at 9:30 AM
# This script installs the launchd service to run the sync automatically

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📅 Setting up daily sync at 9:30 AM..."
echo "📁 Project directory: $PROJECT_DIR"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Determine which plist file to use (prefer the bash wrapper version)
PLIST_SOURCE="$PROJECT_DIR/com.synth.jambase-sync.plist"
PLIST_TEMPLATE="$PROJECT_DIR/scripts/com.synth.daily-sync.plist"

# Check if the main plist exists, otherwise use the template
if [ ! -f "$PLIST_SOURCE" ]; then
    echo "⚠️  Main plist not found, using template..."
    PLIST_SOURCE="$PLIST_TEMPLATE"
fi

if [ ! -f "$PLIST_SOURCE" ]; then
    echo "❌ Error: No plist file found!"
    echo "   Expected: $PROJECT_DIR/com.synth.jambase-sync.plist"
    echo "   Or: $PROJECT_DIR/scripts/com.synth.daily-sync.plist"
    exit 1
fi

# Create a temporary plist with actual paths
PLIST_TEMP=$(mktemp)
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$PLIST_SOURCE" > "$PLIST_TEMP"

# Copy to LaunchAgents directory
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_NAME="com.synth.jambase-sync.plist"
PLIST_DEST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "📋 Installing plist to: $PLIST_DEST"

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCH_AGENTS_DIR"

# Copy the plist file
cp "$PLIST_TEMP" "$PLIST_DEST"

# Clean up temp file
rm "$PLIST_TEMP"

# Unload existing service if it exists
if launchctl list | grep -q "com.synth.jambase-sync"; then
    echo "🔄 Unloading existing service..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Load the service
echo "✅ Loading launchd service..."
launchctl load "$PLIST_DEST"

# Verify it's loaded
if launchctl list | grep -q "com.synth.jambase-sync"; then
    echo ""
    echo "✅ Daily sync service installed successfully!"
    echo ""
    echo "📅 Schedule: Daily at 9:30 AM"
    echo "📁 Logs: $PROJECT_DIR/logs/"
    echo ""
    echo "To check status:"
    echo "  launchctl list | grep com.synth.jambase-sync"
    echo ""
    echo "To unload service:"
    echo "  launchctl unload ~/Library/LaunchAgents/com.synth.jambase-sync.plist"
    echo ""
    echo "To view logs:"
    echo "  tail -f $PROJECT_DIR/logs/launchd-sync.log"
    echo "  tail -f $PROJECT_DIR/logs/launchd-sync-error.log"
else
    echo "❌ Error: Service failed to load"
    echo "Check logs for details: $PROJECT_DIR/logs/launchd-sync-error.log"
    exit 1
fi
