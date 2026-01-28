# How to Check if Daily Sync Ran Today

## Quick Check

Run this command from your project root:

```bash
./scripts/check-sync-status.sh
```

This will check:
1. ✅ If the launchd service is loaded
2. ✅ If the plist is configured for 9:30 AM
3. ✅ If log files exist for today
4. ✅ Database timestamps to see when sync last ran

## Alternative: Check Database Directly

```bash
node scripts/check-last-sync.mjs
```

This queries the database to find the most recent `last_synced_at` timestamp.

## Manual Checks

### 1. Check if service is loaded:
```bash
launchctl list | grep com.synth.jambase-sync
```

If you see output, the service is loaded. If not, run:
```bash
./scripts/setup-daily-sync-930am.sh
```

### 2. Check today's log file:
```bash
ls -lh logs/sync-$(date +%Y-%m-%d).log
```

If the file exists and was modified today, the sync ran.

### 3. View today's sync log:
```bash
cat logs/sync-$(date +%Y-%m-%d).log
```

Or tail it in real-time:
```bash
tail -f logs/sync-$(date +%Y-%m-%d).log
```

### 4. Check launchd logs:
```bash
tail -20 logs/launchd-sync.log
tail -20 logs/launchd-sync-error.log
```

## Expected Behavior

- **Service Status**: Should show `com.synth.jambase-sync` in `launchctl list`
- **Schedule**: Runs daily at 9:30 AM
- **Logs**: Creates `logs/sync-YYYY-MM-DD.log` each day
- **Database**: Updates `last_synced_at` on venues and artists tables

## Troubleshooting

### If sync didn't run today:

1. **Check if service is loaded:**
   ```bash
   launchctl list | grep com.synth.jambase-sync
   ```
   If not loaded, run: `./scripts/setup-daily-sync-930am.sh`

2. **Check error logs:**
   ```bash
   cat logs/launchd-sync-error.log
   ```

3. **Test manually:**
   ```bash
   ./scripts/run-daily-sync.sh
   ```
   This will run the sync immediately to verify it works.

4. **Check macOS permissions:**
   - System Settings → Privacy & Security → Full Disk Access
   - Make sure Terminal (or your terminal app) has Full Disk Access

5. **Verify paths in plist:**
   ```bash
   cat ~/Library/LaunchAgents/com.synth.jambase-sync.plist
   ```
   Make sure all paths are correct (not using `__PROJECT_DIR__` placeholder)

## Next Scheduled Run

The sync runs automatically at **9:30 AM** every day. If it's currently before 9:30 AM, the sync hasn't run yet today. If it's after 9:30 AM and there's no log, check the error logs.
