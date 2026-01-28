# Daily Sync Setup - 9:30 AM

The daily JamBase sync is configured to run automatically at **9:30 AM** every day using macOS launchd.

## Quick Setup

Run the setup script from the project root:

```bash
./scripts/setup-daily-sync-930am.sh
```

This will:
1. Install the launchd service
2. Configure it to run at 9:30 AM daily
3. Set up logging to `logs/launchd-sync.log`

## Manual Setup

If you prefer to set it up manually:

1. **Update the plist file paths** (if needed):
   - Edit `com.synth.jambase-sync.plist` or `scripts/com.synth.daily-sync.plist`
   - Replace `__PROJECT_DIR__` with your actual project path (e.g., `/Users/Owner/Desktop/synth-beta-testing-1`)

2. **Copy to LaunchAgents**:
   ```bash
   cp com.synth.jambase-sync.plist ~/Library/LaunchAgents/
   ```

3. **Load the service**:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.synth.jambase-sync.plist
   ```

## Verify It's Running

Check if the service is loaded:
```bash
launchctl list | grep com.synth.jambase-sync
```

View the schedule:
```bash
launchctl list com.synth.jambase-sync
```

## View Logs

**Standard output:**
```bash
tail -f logs/launchd-sync.log
```

**Error logs:**
```bash
tail -f logs/launchd-sync-error.log
```

**Daily sync logs:**
```bash
tail -f logs/sync-$(date +%Y-%m-%d).log
```

## Unload/Remove Service

To stop the automatic sync:
```bash
launchctl unload ~/Library/LaunchAgents/com.synth.jambase-sync.plist
```

To remove it completely:
```bash
launchctl unload ~/Library/LaunchAgents/com.synth.jambase-sync.plist
rm ~/Library/LaunchAgents/com.synth.jambase-sync.plist
```

## Change Schedule Time

To change the time, edit the plist file:

```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>9</integer>    <!-- Change hour (0-23) -->
    <key>Minute</key>
    <integer>30</integer>   <!-- Change minute (0-59) -->
</dict>
```

Then reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.synth.jambase-sync.plist
launchctl load ~/Library/LaunchAgents/com.synth.jambase-sync.plist
```

## Troubleshooting

### Service Not Running

1. **Check if it's loaded:**
   ```bash
   launchctl list | grep com.synth.jambase-sync
   ```

2. **Check error logs:**
   ```bash
   cat logs/launchd-sync-error.log
   ```

3. **Verify paths are correct** in the plist file

4. **Check permissions:**
   - Make sure the script is executable: `chmod +x scripts/run-daily-sync.sh`
   - macOS may require Full Disk Access for Terminal/scripts

### macOS Security Permissions

If you see "Operation not permitted" errors:

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Add **Terminal** (or your terminal app) to the list
3. Restart your Mac or log out/in

### Manual Test Run

Test the sync manually to verify it works:
```bash
./scripts/run-daily-sync.sh
```

Or directly:
```bash
node scripts/sync-jambase-incremental-3nf.mjs
```

## Current Configuration

- **Schedule:** Daily at 9:30 AM
- **Script:** `scripts/sync-jambase-incremental-3nf.mjs`
- **Wrapper:** `scripts/run-daily-sync.sh`
- **Logs:** `logs/launchd-sync.log` and `logs/sync-YYYY-MM-DD.log`
- **Service Name:** `com.synth.jambase-sync`
