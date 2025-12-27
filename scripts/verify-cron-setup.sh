#!/bin/bash
# Script to verify cron job setup and test execution

echo "🔍 Verifying Cron Job Setup..."
echo ""

# Check if cron is running
echo "1. Checking if cron service is running:"
if ps aux | grep -v grep | grep -q "/usr/sbin/cron"; then
    echo "   ✅ Cron service is running"
else
    echo "   ❌ Cron service is NOT running"
fi
echo ""

# Check cron job configuration
echo "2. Current cron job configuration:"
crontab -l 2>/dev/null | grep -i sync || echo "   ⚠️  No sync cron job found"
echo ""

# Check script exists and is executable
SCRIPT_PATH="/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/scripts/run-daily-sync.sh"
echo "3. Checking script:"
if [ -f "$SCRIPT_PATH" ]; then
    echo "   ✅ Script exists: $SCRIPT_PATH"
    if [ -x "$SCRIPT_PATH" ]; then
        echo "   ✅ Script is executable"
    else
        echo "   ❌ Script is NOT executable (run: chmod +x $SCRIPT_PATH)"
    fi
else
    echo "   ❌ Script NOT found: $SCRIPT_PATH"
fi
echo ""

# Check node availability
echo "4. Checking Node.js:"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_PATH=$(which node)
    echo "   ✅ Node.js found: $NODE_VERSION at $NODE_PATH"
else
    echo "   ❌ Node.js NOT found in PATH"
    echo "   Current PATH: $PATH"
fi
echo ""

# Check logs directory
echo "5. Checking logs directory:"
LOG_DIR="/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/logs"
if [ -d "$LOG_DIR" ]; then
    echo "   ✅ Logs directory exists"
    echo "   Recent log files:"
    ls -lht "$LOG_DIR"/*.log 2>/dev/null | head -5 || echo "   No log files found"
else
    echo "   ⚠️  Logs directory does not exist (will be created on first run)"
fi
echo ""

# Check for cron execution logs
echo "6. Checking for cron execution logs:"
CRON_LOG="$LOG_DIR/cron-executions.log"
if [ -f "$CRON_LOG" ]; then
    echo "   ✅ Cron execution log exists"
    echo "   Last 5 entries:"
    tail -5 "$CRON_LOG" 2>/dev/null || echo "   Log file is empty"
else
    echo "   ⚠️  No cron execution log found (will be created on first run)"
fi
echo ""

# Test script execution (dry run)
echo "7. Testing script execution (dry run - will not actually sync):"
echo "   Run manually to test: $SCRIPT_PATH"
echo ""

# Summary
echo "📋 Summary:"
echo "   - Cron job should run at 1 AM CST (2 AM EST) daily"
echo "   - Check logs/sync-YYYY-MM-DD.log for daily sync results"
echo "   - Check logs/cron-executions.log for cron execution tracking"
echo "   - If sync didn't run, check:"
echo "     1. System logs: log show --predicate 'process == \"cron\"' --last 24h"
echo "     2. Mail for cron errors: mail"
echo "     3. Verify PATH in cron context (cron uses minimal PATH)"
echo ""



