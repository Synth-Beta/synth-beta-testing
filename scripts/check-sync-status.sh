#!/bin/bash
# Check Daily Sync Status
# Verifies if the sync service is set up and if it ran today

set -e

echo "🔍 Checking Daily Sync Status..."
echo ""

# Get project directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Is launchd service loaded?
echo "1️⃣  Checking launchd service status..."
if launchctl list | grep -q "com.synth.jambase-sync"; then
    echo -e "   ${GREEN}✅ Service is loaded${NC}"
    launchctl list | grep "com.synth.jambase-sync"
else
    echo -e "   ${RED}❌ Service is NOT loaded${NC}"
    echo "   Run: ./scripts/setup-daily-sync-930am.sh"
fi
echo ""

# Check 2: Check plist file exists
echo "2️⃣  Checking plist configuration..."
PLIST_PATH="$HOME/Library/LaunchAgents/com.synth.jambase-sync.plist"
if [ -f "$PLIST_PATH" ]; then
    echo -e "   ${GREEN}✅ Plist file exists${NC}"
    echo "   Location: $PLIST_PATH"
    
    # Check schedule
    if grep -q "<integer>9</integer>" "$PLIST_PATH" && grep -q "<integer>30</integer>" "$PLIST_PATH"; then
        echo -e "   ${GREEN}✅ Schedule: 9:30 AM${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Schedule may not be 9:30 AM${NC}"
        echo "   Current schedule:"
        grep -A 2 "StartCalendarInterval" "$PLIST_PATH" || echo "   Could not read schedule"
    fi
else
    echo -e "   ${RED}❌ Plist file not found${NC}"
    echo "   Expected: $PLIST_PATH"
    echo "   Run: ./scripts/setup-daily-sync-930am.sh"
fi
echo ""

# Check 3: Check for log files
echo "3️⃣  Checking log files..."
LOG_DIR="$PROJECT_DIR/logs"
TODAY=$(date +%Y-%m-%d)
TODAY_LOG="$LOG_DIR/sync-$TODAY.log"
LAUNCHD_LOG="$LOG_DIR/launchd-sync.log"
ERROR_LOG="$LOG_DIR/launchd-sync-error.log"

if [ -d "$LOG_DIR" ]; then
    echo -e "   ${GREEN}✅ Logs directory exists${NC}"
    
    if [ -f "$TODAY_LOG" ]; then
        echo -e "   ${GREEN}✅ Today's sync log exists${NC}"
        echo "   File: $TODAY_LOG"
        echo "   Last modified: $(stat -f "%Sm" "$TODAY_LOG" 2>/dev/null || stat -c "%y" "$TODAY_LOG" 2>/dev/null || echo "unknown")"
        echo ""
        echo "   Last 5 lines:"
        tail -n 5 "$TODAY_LOG" | sed 's/^/   /'
    else
        echo -e "   ${YELLOW}⚠️  No sync log for today ($TODAY)${NC}"
    fi
    
    if [ -f "$LAUNCHD_LOG" ]; then
        echo ""
        echo "   Launchd log exists: $LAUNCHD_LOG"
        echo "   Last modified: $(stat -f "%Sm" "$LAUNCHD_LOG" 2>/dev/null || stat -c "%y" "$LAUNCHD_LOG" 2>/dev/null || echo "unknown")"
    fi
    
    if [ -f "$ERROR_LOG" ]; then
        ERROR_SIZE=$(stat -f "%z" "$ERROR_LOG" 2>/dev/null || stat -c "%s" "$ERROR_LOG" 2>/dev/null || echo "0")
        if [ "$ERROR_SIZE" -gt 0 ]; then
            echo -e "   ${RED}⚠️  Error log has content${NC}"
            echo "   Check: $ERROR_LOG"
        fi
    fi
else
    echo -e "   ${YELLOW}⚠️  Logs directory doesn't exist${NC}"
    echo "   Directory: $LOG_DIR"
fi
echo ""

# Check 4: Check database for last sync (if we can connect)
echo "4️⃣  Checking database for recent syncs..."
if command -v node &> /dev/null; then
    # Try to check last_synced_at from venues table
    cd "$PROJECT_DIR"
    if [ -f ".env.local" ] || [ -f ".env" ]; then
        # Load env vars
        export $(cat .env.local 2>/dev/null | grep -v '^#' | xargs) 2>/dev/null || true
        export $(cat .env 2>/dev/null | grep -v '^#' | xargs) 2>/dev/null || true
        
        # Check if we have Supabase credentials
        if [ -n "$SUPABASE_URL" ] || [ -n "$VITE_SUPABASE_URL" ]; then
            echo "   Attempting to check database..."
            node -e "
                const { createClient } = require('@supabase/supabase-js');
                const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
                const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
                
                if (!url || !key) {
                    console.log('   ⚠️  Missing Supabase credentials');
                    process.exit(0);
                }
                
                const supabase = createClient(url, key);
                
                supabase
                    .from('venues')
                    .select('last_synced_at')
                    .not('last_synced_at', 'is', null)
                    .order('last_synced_at', { ascending: false })
                    .limit(1)
                    .single()
                    .then(({ data, error }) => {
                        if (error || !data) {
                            console.log('   ⚠️  Could not check database:', error?.message || 'No data');
                            process.exit(0);
                        }
                        
                        const lastSync = new Date(data.last_synced_at);
                        const now = new Date();
                        const hoursAgo = Math.floor((now - lastSync) / (1000 * 60 * 60));
                        const daysAgo = Math.floor(hoursAgo / 24);
                        
                        console.log('   Last sync in database:', lastSync.toISOString());
                        if (hoursAgo < 24) {
                            console.log('   ✅ Sync ran', hoursAgo, 'hours ago (within last 24 hours)');
                        } else {
                            console.log('   ⚠️  Last sync was', daysAgo, 'days ago');
                        }
                    })
                    .catch(err => {
                        console.log('   ⚠️  Error checking database:', err.message);
                    });
            " 2>/dev/null || echo "   ⚠️  Could not check database (Node.js or dependencies may be missing)"
        else
            echo "   ⚠️  Supabase credentials not found in environment"
        fi
    else
        echo "   ⚠️  No .env file found, skipping database check"
    fi
else
    echo "   ⚠️  Node.js not found, skipping database check"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo ""

# Determine overall status
SERVICE_LOADED=false
PLIST_EXISTS=false
LOG_EXISTS=false

launchctl list | grep -q "com.synth.jambase-sync" && SERVICE_LOADED=true
[ -f "$PLIST_PATH" ] && PLIST_EXISTS=true
[ -f "$TODAY_LOG" ] && LOG_EXISTS=true

if [ "$SERVICE_LOADED" = true ] && [ "$PLIST_EXISTS" = true ]; then
    echo -e "${GREEN}✅ Service is configured and loaded${NC}"
    echo "   Next run: Tomorrow at 9:30 AM"
    
    if [ "$LOG_EXISTS" = true ]; then
        echo -e "${GREEN}✅ Sync appears to have run today${NC}"
    else
        echo -e "${YELLOW}⚠️  No log file for today - sync may not have run yet${NC}"
        echo "   (This is normal if it's before 9:30 AM or the service was just set up)"
    fi
else
    echo -e "${RED}❌ Service is NOT properly configured${NC}"
    echo ""
    echo "To fix this, run:"
    echo "  ./scripts/setup-daily-sync-930am.sh"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
