#!/bin/bash
# Install cron job to run Jambase sync at 1:00 AM EST every day.
# Uses TZ=America/New_York so it runs at 1am Eastern regardless of system timezone.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RUN_SYNC="$SCRIPT_DIR/run-daily-sync.sh"
MARKER="# synth daily sync 1am EST"

# Ensure wrapper script exists and is executable
if [ ! -f "$RUN_SYNC" ]; then
    echo "❌ Error: $RUN_SYNC not found"
    exit 1
fi
chmod +x "$RUN_SYNC" 2>/dev/null || true
mkdir -p "$PROJECT_DIR/logs" 2>/dev/null || true

# Build the crontab line: run every hour at :00; script exits unless it's 1am EST
CRON_LINE="0 * * * * RUN_AT_1AM_EST=1 TZ=America/New_York $RUN_SYNC"

echo "🔧 Installing cron job: daily sync at 1:00 AM EST"
echo ""

# Get existing crontab, remove any existing synth sync line, add new one
if crontab -l 2>/dev/null | grep -q "$MARKER"; then
    echo "   Updating existing synth sync entry..."
    TEMP=$(mktemp)
    crontab -l 2>/dev/null | grep -v "$MARKER" | grep -v "run-daily-sync.sh" > "$TEMP" || true
    echo "$CRON_LINE $MARKER" >> "$TEMP"
    crontab "$TEMP"
    rm -f "$TEMP"
else
    ( crontab -l 2>/dev/null | grep -v "run-daily-sync.sh"; echo "$CRON_LINE $MARKER"; ) | crontab -
fi

echo "✅ Cron job installed."
echo ""
echo "   Schedule: 1:00 AM Eastern (America/New_York) every day"
echo "   (Cron runs hourly; sync runs only when hour is 1am EST.)"
echo "   Command:  $CRON_LINE"
echo ""
echo "   Verify:   crontab -l"
echo "   Logs:     $PROJECT_DIR/logs/sync-YYYY-MM-DD.log"
echo "             $PROJECT_DIR/logs/cron-executions.log"
echo ""
