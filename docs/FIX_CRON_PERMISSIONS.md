# Fix Cron "Operation not permitted" Error

## Problem
The cron job is failing with "Operation not permitted" because macOS security prevents cron from accessing files in the Desktop folder.

## Solution 1: Grant Full Disk Access (Recommended)

1. Open **System Settings** (or System Preferences on older macOS)
2. Go to **Privacy & Security** → **Full Disk Access**
3. Click the **+** button
4. Navigate to `/usr/sbin/cron` and add it
5. OR add **Terminal** (if you run cron from Terminal)
6. Make sure the checkbox is enabled
7. Restart your Mac or restart cron:
   ```bash
   sudo launchctl stop com.apple.cron
   sudo launchctl start com.apple.cron
   ```

## Solution 2: Move Script to Different Location

Move the sync script to a location that doesn't require special permissions:

```bash
# Create a scripts directory in home
mkdir -p ~/scripts

# Copy the sync script
cp scripts/run-daily-sync.sh ~/scripts/

# Update cron job
crontab -e
# Change the path to:
# 0 1 * * * ~/scripts/run-daily-sync.sh
```

## Solution 3: Use macOS launchd Instead of Cron

Create a launchd plist file (more reliable on macOS):

```bash
# Create plist file
cat > ~/Library/LaunchAgents/com.synth.daily-sync.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.synth.daily-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/scripts/run-daily-sync.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>1</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/logs/launchd-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/logs/launchd-sync-error.log</string>
</dict>
</plist>
EOF

# Load the job
launchctl load ~/Library/LaunchAgents/com.synth.daily-sync.plist

# Check status
launchctl list | grep synth
```

## Verify Fix

After applying a solution, wait until 1 AM CST (2 AM EST) or test manually:

```bash
# Test the script manually
./scripts/run-daily-sync.sh

# Check for new log file
ls -lah logs/sync-$(date +%Y-%m-%d).log

# Check cron execution log
tail -f logs/cron-executions.log
```

## Current Status

- ✅ Cron job is configured: `0 1 * * *` (1 AM CST = 2 AM EST)
- ✅ Script exists and is executable
- ✅ Node.js is available
- ❌ **BLOCKED**: macOS security prevents execution from Desktop folder
- 📧 Error sent to mail: "Operation not permitted"



