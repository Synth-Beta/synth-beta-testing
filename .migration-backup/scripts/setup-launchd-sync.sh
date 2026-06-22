#!/bin/bash
# Setup launchd job for daily sync (alternative to cron on macOS)

PLIST_NAME="com.synth.daily-sync"
PLIST_FILE="scripts/${PLIST_NAME}.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$LAUNCH_AGENTS_DIR/${PLIST_NAME}.plist"

echo "🔧 Setting up launchd job for daily sync..."
echo ""

# Check if plist file exists
if [ ! -f "$PLIST_FILE" ]; then
    echo "❌ Error: $PLIST_FILE not found"
    exit 1
fi

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCH_AGENTS_DIR"

# Copy plist to LaunchAgents
echo "📋 Copying plist to LaunchAgents..."
cp "$PLIST_FILE" "$TARGET_PLIST"

# Unload existing job if it exists
if launchctl list | grep -q "$PLIST_NAME"; then
    echo "🔄 Unloading existing job..."
    launchctl unload "$TARGET_PLIST" 2>/dev/null
fi

# Load the job
echo "✅ Loading launchd job..."
launchctl load "$TARGET_PLIST"

# Check status
echo ""
echo "📊 Job status:"
if launchctl list | grep -q "$PLIST_NAME"; then
    echo "   ✅ Job is loaded and scheduled"
    echo "   ⏰ Will run daily at 9:30 AM"
else
    echo "   ⚠️  Job may not be loaded correctly"
fi

echo ""
echo "📝 To check job status:"
echo "   launchctl list | grep $PLIST_NAME"
echo ""
echo "📝 To unload job:"
echo "   launchctl unload $TARGET_PLIST"
echo ""
echo "📝 To view logs:"
echo "   tail -f logs/launchd-sync.log"
echo "   tail -f logs/launchd-sync-error.log"








