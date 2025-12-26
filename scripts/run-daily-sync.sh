#!/bin/bash
# Daily Jambase Sync Script
# Runs incremental sync and logs output

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR" || exit 1

# Load environment variables if .env.local exists
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Log file with date
LOG_FILE="logs/sync-$(date +%Y-%m-%d).log"

# Log start time
echo "===========================================" >> "$LOG_FILE"
echo "Daily Sync Started: $(date)" >> "$LOG_FILE"
echo "===========================================" >> "$LOG_FILE"

# Run the sync script and log to both file and terminal (if run interactively)
# When run from cron, output goes to log file
if [ -t 0 ]; then
    # Running interactively - show output on terminal
    node scripts/sync-jambase-incremental-3nf.mjs 2>&1 | tee -a "$LOG_FILE"
else
    # Running from cron - log to file only
    node scripts/sync-jambase-incremental-3nf.mjs >> "$LOG_FILE" 2>&1
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

# Exit with the same code
exit $EXIT_CODE

