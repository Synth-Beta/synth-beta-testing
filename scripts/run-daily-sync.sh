#!/bin/bash
# Daily Jambase Sync Script
# Runs incremental sync and logs output

# Set full paths to avoid PATH issues in cron
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
NODE_PATH="/opt/homebrew/bin/node"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR" || {
    echo "ERROR: Failed to change to project directory: $PROJECT_DIR" >&2
    exit 1
}

# Load environment variables if .env.local exists
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Log file with date
LOG_FILE="logs/sync-$(date +%Y-%m-%d).log"

# Also log to a permanent cron log for debugging
CRON_LOG="logs/cron-executions.log"
echo "[$(date)] Cron job started - PID: $$" >> "$CRON_LOG"

# Log start time
echo "===========================================" >> "$LOG_FILE"
echo "Daily Sync Started: $(date)" >> "$LOG_FILE"
echo "===========================================" >> "$LOG_FILE"

# Verify node is available
if ! command -v node &> /dev/null; then
    echo "ERROR: node command not found. PATH: $PATH" >> "$LOG_FILE"
    echo "ERROR: node command not found. PATH: $PATH" >> "$CRON_LOG"
    exit 1
fi

# Run the sync script and log to both file and terminal (if run interactively)
# When run from cron, output goes to log file
if [ -t 0 ]; then
    # Running interactively - show output on terminal
    node scripts/sync-jambase-incremental-3nf.mjs 2>&1 | tee -a "$LOG_FILE"
else
    # Running from cron - log to file only
    echo "[$(date)] Starting sync script execution" >> "$CRON_LOG"
    node scripts/sync-jambase-incremental-3nf.mjs >> "$LOG_FILE" 2>&1
    SYNC_EXIT_CODE=$?
    echo "[$(date)] Sync script finished with exit code: $SYNC_EXIT_CODE" >> "$CRON_LOG"
fi

# Capture exit code
EXIT_CODE=$?

# Log end time and exit code
echo "" >> "$LOG_FILE"
echo "===========================================" >> "$LOG_FILE"
echo "Daily Sync Finished: $(date)" >> "$LOG_FILE"
echo "Exit Code: $EXIT_CODE" >> "$LOG_FILE"
echo "===========================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Also log to cron log
echo "[$(date)] Cron job finished - Exit Code: $EXIT_CODE" >> "$CRON_LOG"

# Exit with the same code
exit $EXIT_CODE

