#!/bin/bash
# Test the sync script manually to verify it works

echo "🧪 Testing sync script manually..."
echo ""

# Run the sync script
./scripts/run-daily-sync.sh

# Check the results
echo ""
echo "📊 Results:"
echo ""

# Check if log was created
TODAY=$(date +%Y-%m-%d)
LOG_FILE="logs/sync-${TODAY}.log"

if [ -f "$LOG_FILE" ]; then
    echo "✅ Log file created: $LOG_FILE"
    echo ""
    echo "Last 20 lines of log:"
    tail -20 "$LOG_FILE"
else
    echo "❌ No log file created"
fi

# Check cron execution log
if [ -f "logs/cron-executions.log" ]; then
    echo ""
    echo "📝 Cron execution log:"
    tail -5 "logs/cron-executions.log"
fi



